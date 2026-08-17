from typing import Any, Literal
import httpx
import numpy as np
import rasterio
from rasterio.features import shapes
from rasterio.io import MemoryFile
from shapely.geometry import shape, mapping
from pydantic import BaseModel, Field, HttpUrl
from fastapi import FastAPI, HTTPException

Label = Literal["VEGETATION_DECLINE","POSSIBLE_WATER_STRESS","POSSIBLE_EXCESS_MOISTURE","UNEVEN_GROWTH","UNKNOWN_STRESS"]
class Request(BaseModel):
    captureId: str
    fieldBoundary: dict[str, Any]
    ndviRasterUrl: HttpUrl
    currentStatistics: list[dict[str, Any]]
    previousObservations: list[dict[str, Any]] = []
    minimumAreaHectares: float = Field(default=.02, gt=0)
class Zone(BaseModel):
    label: Label
    severity: Literal["LOW","MODERATE","HIGH"]
    score: float
    areaHectares: float
    geometry: dict[str, Any]
    evidence: dict[str,float]

app=FastAPI(title="FasalGuard Geospatial Analysis",version="1.0.0")
@app.get("/health")
def health()->dict[str,str]: return {"status":"ok"}

def historical_mean(items:list[dict[str,Any]], index:str)->float|None:
    values=[]
    for item in items:
        if item.get("index") != index: continue
        try: values.append(float(item["statistics"]["mean"]))
        except (KeyError,TypeError,ValueError): pass
    return float(np.median(values)) if values else None

def current_mean(items:list[dict[str,Any]], index:str)->float|None:
    for item in items:
        if item.get("index") != index: continue
        try: return float(item["statistics"]["mean"])
        except (KeyError,TypeError,ValueError): return None
    return None

@app.post("/v1/stress-analysis")
async def analyse(req:Request)->dict[str,list[Zone]]:
    # A temporal field baseline is mandatory: no universal crop-independent NDVI cutoff.
    baseline=historical_mean(req.previousObservations,"NDVI")
    if baseline is None: return {"zones":[]}
    moisture_baseline=historical_mean(req.previousObservations,"NDMI")
    moisture_current=current_mean(req.currentStatistics,"NDMI")
    try:
        async with httpx.AsyncClient(timeout=25,follow_redirects=False) as client:
            response=await client.get(str(req.ndviRasterUrl)); response.raise_for_status()
        with MemoryFile(response.content) as mem, mem.open() as ds:
            raster=ds.read(1).astype("float32"); valid=ds.read(2)>0 if ds.count>1 else np.isfinite(raster)
            transform=ds.transform; crs=ds.crs
    except Exception as exc: raise HTTPException(422,"Unable to read signed analysis raster") from exc
    delta=raster-baseline
    valid_delta=delta[valid & np.isfinite(delta)]
    if valid_delta.size<20:return {"zones":[]}
    # Robust anomaly magnitude is field/history-relative, not a universal vegetation threshold.
    mad=float(np.median(np.abs(valid_delta-np.median(valid_delta)))) or .02
    mask=valid & np.isfinite(delta) & (delta < -max(.08,2.5*mad))
    field=shape(req.fieldBoundary)
    zones=[]
    for geom,value in shapes(mask.astype("uint8"),mask=mask,transform=transform):
        if value!=1:continue
        polygon=shape(geom)
        if crs and crs.to_epsg()!=4326:
            # Sentinel output is requested on field geometry; reject unexpected CRS rather than misproject.
            continue
        polygon=polygon.intersection(field)
        if polygon.is_empty:continue
        area_ha=polygon.area*111_320*111_320*np.cos(np.deg2rad(polygon.centroid.y))/10_000
        if area_ha<req.minimumAreaHectares:continue
        local=raster[mask]; drop=max(0.0,baseline-float(np.mean(local)))
        score=min(1.0,drop/max(abs(baseline),.1)); severity="HIGH" if score>=.6 else "MODERATE" if score>=.3 else "LOW"
        label:Label="VEGETATION_DECLINE"
        if moisture_baseline is not None and moisture_current is not None:
            moisture_delta=moisture_current-moisture_baseline
            if moisture_delta < -.08: label="POSSIBLE_WATER_STRESS"
            elif moisture_delta > .10: label="POSSIBLE_EXCESS_MOISTURE"
        zones.append(Zone(label=label,severity=severity,score=round(score,4),areaHectares=round(float(area_ha),4),geometry=mapping(polygon),evidence={"currentMean":round(float(np.mean(local)),4),"historicalMedian":round(baseline,4),"decline":round(drop,4),"moistureDelta":round((moisture_current-moisture_baseline),4) if moisture_current is not None and moisture_baseline is not None else 0.0}))
    return {"zones":zones}

from typing import Any, Literal
import httpx
import numpy as np
import rasterio
from rasterio.features import geometry_mask, shapes
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
class Baseline(BaseModel):
    method: Literal["ROLLING_FIELD_BASELINE","PREVIOUS_VALID_OBSERVATION","INSUFFICIENT_HISTORY"]
    captureIds: list[str]
    observationCount: int
class AnalysisResponse(BaseModel):
    methodology: Literal["FIELD_TEMPORAL_BASELINE"] = "FIELD_TEMPORAL_BASELINE"
    baseline: Baseline
    zones: list[Zone]

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

def baseline_context(items:list[dict[str,Any]])->Baseline:
    capture_ids=list(dict.fromkeys(str(item["captureId"]) for item in items if item.get("captureId")))
    count=len(capture_ids)
    method="ROLLING_FIELD_BASELINE" if count >= 3 else "PREVIOUS_VALID_OBSERVATION" if count else "INSUFFICIENT_HISTORY"
    return Baseline(method=method,captureIds=capture_ids,observationCount=count)

def current_mean(items:list[dict[str,Any]], index:str)->float|None:
    for item in items:
        if item.get("index") != index: continue
        try: return float(item["statistics"]["mean"])
        except (KeyError,TypeError,ValueError): return None
    return None

@app.post("/v1/stress-analysis",response_model=AnalysisResponse)
async def analyse(req:Request)->AnalysisResponse:
    # A temporal field baseline is mandatory: no universal crop-independent NDVI cutoff.
    context=baseline_context(req.previousObservations)
    baseline=historical_mean(req.previousObservations,"NDVI")
    if baseline is None:return AnalysisResponse(baseline=context,zones=[])
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
    if valid_delta.size<20:return AnalysisResponse(baseline=context,zones=[])
    # Robust anomaly magnitude is field/history-relative, not a universal vegetation threshold.
    center=float(np.median(valid_delta))
    mad=max(float(np.median(np.abs(valid_delta-center))),np.finfo("float32").eps)
    mask=valid & np.isfinite(delta) & (delta < center-(2.5*mad))
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
        zone_mask=geometry_mask([mapping(polygon)],out_shape=raster.shape,transform=transform,invert=True)
        local=raster[mask & zone_mask]
        if not local.size:continue
        drop=max(0.0,baseline-float(np.mean(local)))
        score=min(1.0,drop/max(abs(baseline),.1)); severity="HIGH" if score>=.6 else "MODERATE" if score>=.3 else "LOW"
        label:Label="VEGETATION_DECLINE"
        moisture_values=[]
        for item in req.previousObservations:
            if item.get("index") != "NDMI":continue
            try:moisture_values.append(float(item["statistics"]["mean"]))
            except (KeyError,TypeError,ValueError):pass
        if moisture_baseline is not None and moisture_current is not None and len(moisture_values)>=3:
            moisture_delta=moisture_current-moisture_baseline
            moisture_mad=max(float(np.median(np.abs(np.array(moisture_values)-moisture_baseline))),np.finfo("float32").eps)
            if moisture_delta < -(2.5*moisture_mad):label="POSSIBLE_WATER_STRESS"
            elif moisture_delta > 2.5*moisture_mad:label="POSSIBLE_EXCESS_MOISTURE"
        zones.append(Zone(label=label,severity=severity,score=round(score,4),areaHectares=round(float(area_ha),4),geometry=mapping(polygon),evidence={"currentMean":round(float(np.mean(local)),4),"historicalMedian":round(baseline,4),"decline":round(drop,4),"moistureDelta":round((moisture_current-moisture_baseline),4) if moisture_current is not None and moisture_baseline is not None else 0.0}))
    return AnalysisResponse(baseline=context,zones=zones)

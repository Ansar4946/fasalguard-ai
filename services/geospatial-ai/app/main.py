from typing import Any, Literal
from datetime import datetime, timezone
import base64
import io
import json
import os
from pathlib import Path
import httpx
import numpy as np
import onnxruntime as ort
import rasterio
from rasterio.features import geometry_mask, shapes
from rasterio.io import MemoryFile
from shapely.geometry import shape, mapping
from pydantic import BaseModel, Field, HttpUrl
from fastapi import FastAPI, HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError
from app.amis_scraper import AmisScrapeError, AmisScraper

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
def health()->dict[str,str|bool]: return {"status":"ok","visionModelConfigured":vision_model_available()}

class AmisCommodity(BaseModel):
    name: str = Field(min_length=1,max_length=100)
    commodityId: str = Field(pattern=r"^\d{1,5}$")

class AmisPriceRequest(BaseModel):
    commodities: list[AmisCommodity] = Field(min_length=1,max_length=20)

@app.post("/v1/market/amis/prices")
def amis_prices(req:AmisPriceRequest)->dict[str,Any]:
    if os.getenv("AMIS_SCRAPER_ENABLED","false").casefold()!="true":
        raise HTTPException(503,"AMIS_SCRAPER_DISABLED")
    scraper=AmisScraper(base_url=os.getenv("AMIS_BASE_URL","http://www.amis.pk"),timeout_seconds=float(os.getenv("AMIS_TIMEOUT_SECONDS","20")),delay_seconds=float(os.getenv("AMIS_REQUEST_DELAY_SECONDS","1")))
    try:
        records=scraper.fetch([item.model_dump() for item in req.commodities])
    except AmisScrapeError as exc:
        raise HTTPException(502,"AMIS_SCRAPE_FAILED") from exc
    return {"provider":"AMIS","fetchedAt":datetime.now(timezone.utc).isoformat(),"records":records}

class VisionImage(BaseModel):
    imageBase64: str = Field(min_length=16)
    contentType: Literal["image/jpeg","image/png","image/webp"]
    category: Literal["LEAF_FRONT","LEAF_BACK","WHOLE_PLANT","FIELD_CONTEXT","PEST_IMAGE"]

class VisionQualityResponse(BaseModel):
    acceptable: bool
    issues: list[dict[str,Any]]
    metadata: dict[str,Any]

class VisionPredictRequest(BaseModel):
    images: list[VisionImage] = Field(min_length=1,max_length=5)

class VisionAlternative(BaseModel):
    condition: str
    confidence: float

class VisionPredictionResponse(BaseModel):
    modelId: str
    modelVersion: str
    predictedCondition: str
    confidence: float
    alternatives: list[VisionAlternative]
    inferenceTimestamp: str
    rawProviderResponse: dict[str,Any]

_vision_session: ort.InferenceSession|None=None
_vision_manifest: dict[str,Any]|None=None

def vision_paths()->tuple[Path,Path]:
    return (Path(os.getenv("VISION_MODEL_PATH","/models/cotton-disease.onnx")),Path(os.getenv("VISION_MODEL_MANIFEST_PATH","/models/cotton-disease.json")))

def vision_model_available()->bool:
    model,manifest=vision_paths()
    return model.is_file() and manifest.is_file()

def decode_vision_image(item:VisionImage)->Image.Image:
    try:
        raw=base64.b64decode(item.imageBase64,validate=True)
        if len(raw)>15*1024*1024: raise HTTPException(413,"IMAGE_TOO_LARGE")
        image=Image.open(io.BytesIO(raw)); image.verify()
        image=Image.open(io.BytesIO(raw)); image=ImageOps.exif_transpose(image).convert("RGB")
    except (ValueError,UnidentifiedImageError,OSError) as exc:
        raise HTTPException(422,"CORRUPT_OR_INVALID_IMAGE") from exc
    if image.width<320 or image.height<320: raise HTTPException(422,"IMAGE_DIMENSIONS_TOO_SMALL")
    return image

def quality_metrics(image:Image.Image)->VisionQualityResponse:
    gray=np.asarray(image.resize((256,256)).convert("L"),dtype=np.float32)
    mean=float(gray.mean()); dark=float((gray<=18).mean()); bright=float((gray>=245).mean())
    lap=-4*gray+np.roll(gray,1,0)+np.roll(gray,-1,0)+np.roll(gray,1,1)+np.roll(gray,-1,1)
    focus=float(lap[1:-1,1:-1].var())
    issues=[]
    if mean<38 or dark>.65: issues.append({"code":"TOO_DARK","score":round(mean/255,4)})
    if mean>225 or bright>.65: issues.append({"code":"OVEREXPOSED","score":round(bright,4)})
    if focus<18: issues.append({"code":"POSSIBLY_BLURRY","score":round(focus,4)})
    return VisionQualityResponse(acceptable=not issues,issues=issues,metadata={"method":"PIXEL_QUALITY_V1","brightnessMean":round(mean,4),"focusScore":round(focus,4),"darkRatio":round(dark,4),"brightRatio":round(bright,4)})

def load_vision_model()->tuple[ort.InferenceSession,dict[str,Any]]:
    global _vision_session,_vision_manifest
    if _vision_session is not None and _vision_manifest is not None:return _vision_session,_vision_manifest
    model_path,manifest_path=vision_paths()
    if not model_path.is_file() or not manifest_path.is_file():
        raise HTTPException(503,"MODEL_NOT_CONFIGURED")
    try:
        manifest=json.loads(manifest_path.read_text(encoding="utf-8"))
        required=("modelId","modelVersion","inputWidth","inputHeight","classes","mean","std")
        valid_dimensions=32<=int(manifest.get("inputWidth",0))<=2048 and 32<=int(manifest.get("inputHeight",0))<=2048
        valid_classes=isinstance(manifest.get("classes"),list) and 2<=len(manifest["classes"])<=100 and all(isinstance(x,str) and 1<=len(x)<=120 for x in manifest["classes"])
        valid_normalization=all(isinstance(manifest.get(key),list) and len(manifest[key])==3 for key in ("mean","std")) and all(float(x)>0 for x in manifest["std"])
        if any(key not in manifest for key in required) or not valid_dimensions or not valid_classes or not valid_normalization:raise ValueError("invalid manifest")
        session=ort.InferenceSession(str(model_path),providers=["CPUExecutionProvider"])
    except Exception as exc:
        raise HTTPException(503,"MODEL_LOAD_FAILED") from exc
    _vision_session=session;_vision_manifest=manifest
    return session,manifest

def softmax(values:np.ndarray)->np.ndarray:
    shifted=values-np.max(values)
    exp=np.exp(shifted)
    return exp/np.sum(exp)

def infer_image(image:Image.Image,session:ort.InferenceSession,manifest:dict[str,Any])->np.ndarray:
    resized=image.resize((int(manifest["inputWidth"]),int(manifest["inputHeight"])),Image.Resampling.LANCZOS)
    tensor=np.asarray(resized,dtype=np.float32)/255.0
    mean=np.asarray(manifest["mean"],dtype=np.float32);std=np.asarray(manifest["std"],dtype=np.float32)
    tensor=(tensor-mean)/std;tensor=np.transpose(tensor,(2,0,1))[None,...]
    output=np.asarray(session.run(None,{session.get_inputs()[0].name:tensor})[0]).reshape(-1)
    if output.size!=len(manifest["classes"]):raise HTTPException(503,"MODEL_OUTPUT_CLASS_MISMATCH")
    if np.all(output>=0) and np.all(output<=1) and .98<=float(output.sum())<=1.02:return output/output.sum()
    return softmax(output)

@app.get("/v1/vision/models")
def vision_models()->dict[str,Any]:
    if not vision_model_available():return {"configured":False,"reason":"MODEL_NOT_CONFIGURED"}
    _,manifest=load_vision_model()
    return {"configured":True,"modelId":manifest["modelId"],"modelVersion":manifest["modelVersion"],"classes":manifest["classes"]}

@app.post("/v1/vision/quality",response_model=VisionQualityResponse)
def vision_quality(req:VisionImage)->VisionQualityResponse:
    return quality_metrics(decode_vision_image(req))

@app.post("/v1/vision/predict",response_model=VisionPredictionResponse)
def vision_predict(req:VisionPredictRequest)->VisionPredictionResponse:
    session,manifest=load_vision_model();per_image=[]
    for item in req.images:
        probabilities=infer_image(decode_vision_image(item),session,manifest)
        per_image.append(probabilities)
    combined=np.mean(np.stack(per_image),axis=0);order=np.argsort(combined)[::-1]
    classes=list(manifest["classes"]);top=int(order[0])
    return VisionPredictionResponse(modelId=str(manifest["modelId"]),modelVersion=str(manifest["modelVersion"]),predictedCondition=classes[top],confidence=round(float(combined[top]),6),alternatives=[VisionAlternative(condition=classes[int(i)],confidence=round(float(combined[int(i)]),6)) for i in order[1:4]],inferenceTimestamp=datetime.now(timezone.utc).isoformat(),rawProviderResponse={"engine":"ONNX_RUNTIME","imageCount":len(req.images),"categories":[item.category for item in req.images],"aggregation":"MEAN_CLASS_PROBABILITY"})

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

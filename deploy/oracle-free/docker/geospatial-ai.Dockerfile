# Oracle-free kit: services/geospatial-ai/Dockerfile with ONE change for arm64.
# rasterio 1.4.3 (pinned in requirements.txt) publishes NO linux/aarch64 wheel, so `pip install`
# would try to compile it against GDAL (not installed) and fail. rasterio 1.4.4 ships
# manylinux_2_28_aarch64 wheels (verified on PyPI). The sed bumps only that pin, at build time.
# Build context: services/geospatial-ai
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libexpat1 && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN sed -i 's/^rasterio==1\.4\.3$/rasterio==1.4.4/' requirements.txt \
 && grep -q '^rasterio==1\.4\.4$' requirements.txt \
 && pip install --no-cache-dir -r requirements.txt
COPY app ./app
USER 65532:65532
EXPOSE 8000
CMD ["uvicorn","app.main:app","--host","0.0.0.0","--port","8000"]

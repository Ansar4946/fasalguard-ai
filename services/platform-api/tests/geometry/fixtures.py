"""Synthetic WGS84 parcels inside the shared integration farm, not real farmer data."""


def square(lo=72.0002, la=31.0002, size=0.0006):
    hi, top = round(lo + size, 7), round(la + size, 7)
    return {"type": "Polygon", "coordinates": [[[lo, la], [hi, la], [hi, top], [lo, top], [lo, la]]]}


def with_hole():
    outer = square()
    outer["coordinates"].append(square(72.0003, 31.0003, 0.0001)["coordinates"][0])
    return outer


def feature(geometry=None, name="Synthetic imported field"):
    return {"type": "Feature", "geometry": geometry or with_hole(), "properties": {"name": name}}

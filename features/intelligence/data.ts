import type { CropWeatherDay, SatelliteZone, SmartAlert } from "./types";

export const satelliteZones: SatelliteZone[] = [
  { id: "north-west", name: "North-west zone", status: "high-stress", areaAcres: 5.1, changePercent: -12, left: 27, top: 31 },
  { id: "canal-edge", name: "Canal edge", status: "watch", areaAcres: 7.4, changePercent: -4, left: 61, top: 57 },
  { id: "east-block", name: "Eastern block", status: "healthy", areaAcres: 29.5, changePercent: 6, left: 72, top: 25 },
];

export const cropWeatherDays: CropWeatherDay[] = [
  { day: "Today", date: "3 Aug", temperature: "25–34°", rain: 20, humidity: 72, windKph: 12, suitability: 74, risk: "caution", action: "Inspect younger leaves", spray: "Good window before 10 AM" },
  { day: "Tue", date: "4 Aug", temperature: "26–35°", rain: 55, humidity: 81, windKph: 16, suitability: 58, risk: "harmful", action: "Delay irrigation", spray: "Avoid before rainfall" },
  { day: "Wed", date: "5 Aug", temperature: "25–33°", rain: 70, humidity: 86, windKph: 20, suitability: 46, risk: "harmful", action: "Check drainage", spray: "Do not spray" },
  { day: "Thu", date: "6 Aug", temperature: "24–32°", rain: 35, humidity: 76, windKph: 11, suitability: 69, risk: "caution", action: "Inspect north-west zone", spray: "Possible after 4 PM" },
  { day: "Fri", date: "7 Aug", temperature: "25–34°", rain: 10, humidity: 64, windKph: 8, suitability: 88, risk: "beneficial", action: "Resume field work", spray: "Best window 7–10 AM" },
  { day: "Sat", date: "8 Aug", temperature: "27–37°", rain: 5, humidity: 58, windKph: 10, suitability: 67, risk: "caution", action: "Monitor heat stress", spray: "Avoid midday heat" },
  { day: "Sun", date: "9 Aug", temperature: "26–35°", rain: 15, humidity: 61, windKph: 9, suitability: 81, risk: "beneficial", action: "Normal monitoring", spray: "Good morning window" },
];

export const smartAlerts: SmartAlert[] = [
  { id: "humidity-cotton", category: "humidity", urgency: "high", title: "Disease-favourable humidity expected", field: "North Field", crop: "Cotton · flowering", happening: "Humidity may remain above 80% for the next 36 hours.", why: "Prolonged leaf wetness can support fungal activity, especially where vegetation is dense.", action: "Inspect lower and younger leaves; avoid unnecessary irrigation.", href: "/weather" },
  { id: "satellite-decline", category: "satellite", urgency: "high", title: "Vegetation activity declined", field: "North-west zone", crop: "Cotton · CIM-632", happening: "Satellite vegetation activity is 12% lower than the previous clear capture.", why: "The pattern can indicate moisture, nutrient, pest or crop-health stress; satellite data cannot identify the exact cause.", action: "Create a ground inspection and upload a close crop photo.", href: "/satellite" },
  { id: "spray-wind", category: "wind", urgency: "medium", title: "Spraying window closes at midday", field: "South Field", crop: "Cotton · flowering", happening: "Wind is forecast to exceed 18 km/h after 11 AM.", why: "Higher wind can cause spray drift and reduce application coverage.", action: "Spray only during the early safe window or postpone.", href: "/weather" },
];

/** Turns a raw GeolocationPositionError into copy that actually tells the farmer what to do. */
export function describeGeolocationError(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "Location access is blocked for this site. Click the location icon in your browser's address bar, allow access, then try again.";
    case error.POSITION_UNAVAILABLE:
      return "Your device couldn't determine its location right now — check that location services are turned on.";
    case error.TIMEOUT:
      return "Location lookup took too long — try again.";
    default:
      return "Couldn't get your location — select it manually.";
  }
}

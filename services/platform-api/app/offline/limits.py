from starlette.responses import JSONResponse


class OfflineBodyLimit:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("method") != "POST" or scope.get("path") != "/api/v1/offline-scans/sync":
            return await self.app(scope, receive, send)
        data = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            data.extend(message.get("body", b""))
            if len(data) > 65536:
                return await JSONResponse({"error": {"code": "INPUT_TOO_LARGE", "message": "Offline sync is limited to 64 KiB."}}, status_code=413)(
                    scope, receive, send
                )
            if not message.get("more_body", False):
                break
        first = True

        async def replay():
            nonlocal first
            if first:
                first = False
                return {"type": "http.request", "body": bytes(data), "more_body": False}
            return await receive()

        return await self.app(scope, replay, send)

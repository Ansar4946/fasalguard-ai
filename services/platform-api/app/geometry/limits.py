"""Cap geometry request bytes before JSON parsing, including chunked transfers."""

from starlette.responses import JSONResponse


class GeometryBodyLimit:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        path = scope.get("path", "")
        selected = path.startswith("/api/v1/geometry/") or path.endswith(("/fields/import", "/boundary"))
        if scope["type"] != "http" or scope.get("method") not in {"POST", "PATCH"} or not selected:
            return await self.app(scope, receive, send)
        chunks, size = [], 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            size += len(message.get("body", b""))
            if size > 262144:
                return await JSONResponse({"error": {"code": "INPUT_TOO_LARGE", "message": "Geometry requests are limited to 256 KiB."}}, status_code=413)(
                    scope, receive, send
                )
            chunks.append(message.get("body", b""))
            if not message.get("more_body", False):
                break
        pending = True

        async def bounded_receive():
            nonlocal pending
            if pending:
                pending = False
                return {"type": "http.request", "body": b"".join(chunks), "more_body": False}
            return await receive()

        return await self.app(scope, bounded_receive, send)

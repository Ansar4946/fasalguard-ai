"""Bound JSON size before parsing, including chunked requests, without changing F01/F02."""

from starlette.responses import JSONResponse


class IrrigationBodyLimit:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        path = scope.get("path", "")
        if scope["type"] != "http" or scope.get("method") not in {"POST", "PUT"} or not ("/irrigation" in path or "/water-productivity" in path):
            return await self.app(scope, receive, send)
        chunks, size = [], 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            data = message.get("body", b"")
            size += len(data)
            if size > 262144:
                response = JSONResponse({"error": {"code": "INPUT_TOO_LARGE", "message": "Irrigation request exceeds256KiB."}}, status_code=413)
                return await response(scope, receive, send)
            chunks.append(data)
            if not message.get("more_body", False):
                break
        first = True

        async def bounded_receive():
            nonlocal first
            if first:
                first = False
                return {"type": "http.request", "body": b"".join(chunks), "more_body": False}
            return await receive()

        return await self.app(scope, bounded_receive, send)

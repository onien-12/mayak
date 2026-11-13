"""Application errors rendered as `{"detail": <Russian message>, "code": <machine code>}`."""

from collections.abc import Sequence
from http import HTTPStatus
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

VALIDATION_DETAIL = "Проверьте правильность заполнения полей."


class AppError(Exception):
    status_code: int = HTTPStatus.BAD_REQUEST
    code: str = "bad_request"

    def __init__(self, detail: str, *, code: str | None = None) -> None:
        super().__init__(detail)
        self.detail = detail
        if code is not None:
            self.code = code

    def payload(self) -> dict[str, Any]:
        return {"detail": self.detail, "code": self.code}


class BadRequestError(AppError):
    pass


class UnauthorizedError(AppError):
    status_code = HTTPStatus.UNAUTHORIZED
    code = "unauthorized"


class ForbiddenError(AppError):
    status_code = HTTPStatus.FORBIDDEN
    code = "forbidden"


class NotFoundError(AppError):
    status_code = HTTPStatus.NOT_FOUND
    code = "not_found"


class ConflictError(AppError):
    status_code = HTTPStatus.CONFLICT
    code = "conflict"


class PayloadTooLargeError(AppError):
    status_code = HTTPStatus.REQUEST_ENTITY_TOO_LARGE
    code = "payload_too_large"


class UnsupportedMediaError(AppError):
    status_code = HTTPStatus.UNSUPPORTED_MEDIA_TYPE
    code = "unsupported_media_type"


class RateLimitedError(AppError):
    status_code = HTTPStatus.TOO_MANY_REQUESTS
    code = "rate_limited"


class HomeCooldownError(RateLimitedError):
    """The home area was changed recently and cannot be changed again yet."""

    code = "home_cooldown"


class ContentFlaggedError(AppError):
    """A review or comment tripped the automatic content checks."""

    status_code = HTTPStatus.UNPROCESSABLE_ENTITY
    code = "content_flagged"


class FieldValidationError(AppError):
    """Field-level validation failure detected by a service (same shape as request validation)."""

    status_code = HTTPStatus.UNPROCESSABLE_ENTITY
    code = "validation_error"

    def __init__(self, field: str, message: str) -> None:
        super().__init__(VALIDATION_DETAIL)
        self.errors = [{"field": field, "message": message}]

    def payload(self) -> dict[str, Any]:
        return {**super().payload(), "errors": self.errors}


_VALIDATION_MESSAGES: dict[str, str] = {
    "missing": "Обязательное поле",
    "string_too_short": "Минимальная длина — {min_length} симв.",
    "string_too_long": "Максимальная длина — {max_length} симв.",
    "string_pattern_mismatch": "Недопустимый формат",
    "too_short": "Слишком мало элементов (минимум {min_length})",
    "too_long": "Слишком много элементов (максимум {max_length})",
    "greater_than": "Значение должно быть больше {gt}",
    "greater_than_equal": "Значение должно быть не меньше {ge}",
    "less_than": "Значение должно быть меньше {lt}",
    "less_than_equal": "Значение должно быть не больше {le}",
    "int_parsing": "Ожидается целое число",
    "int_type": "Ожидается целое число",
    "float_parsing": "Ожидается число",
    "float_type": "Ожидается число",
    "bool_parsing": "Ожидается значение «да» или «нет»",
    "string_type": "Ожидается строка",
    "enum": "Недопустимое значение",
    "literal_error": "Недопустимое значение",
    "datetime_parsing": "Некорректная дата и время",
    "datetime_from_date_parsing": "Некорректная дата и время",
    "json_invalid": "Некорректный JSON",
}
_FALLBACK_VALIDATION_MESSAGE = "Некорректное значение"
_LOCATION_PREFIXES = frozenset({"body", "query", "path", "header"})

_HTTP_DETAILS: dict[int, tuple[str, str]] = {
    HTTPStatus.NOT_FOUND: ("Ресурс не найден.", "not_found"),
    HTTPStatus.METHOD_NOT_ALLOWED: ("Метод не поддерживается.", "method_not_allowed"),
    HTTPStatus.UNAUTHORIZED: ("Требуется авторизация.", "unauthorized"),
    HTTPStatus.FORBIDDEN: ("Недостаточно прав.", "forbidden"),
}


def _field_path(location: Sequence[str | int]) -> str:
    parts = [str(part) for part in location]
    if parts and parts[0] in _LOCATION_PREFIXES:
        parts = parts[1:]
    return ".".join(parts)


def _validation_message(error: dict[str, Any]) -> str:
    if error["type"] == "value_error":
        cause = error.get("ctx", {}).get("error")
        return str(cause) if cause else _FALLBACK_VALIDATION_MESSAGE
    template = _VALIDATION_MESSAGES.get(error["type"], _FALLBACK_VALIDATION_MESSAGE)
    try:
        return template.format(**error.get("ctx", {}))
    except (KeyError, IndexError):
        return _FALLBACK_VALIDATION_MESSAGE


async def _handle_app_error(_: Request, error: AppError) -> JSONResponse:
    return JSONResponse(status_code=error.status_code, content=error.payload())


async def _handle_validation_error(_: Request, error: RequestValidationError) -> JSONResponse:
    errors = [
        {"field": _field_path(item["loc"]), "message": _validation_message(item)} for item in error.errors()
    ]
    return JSONResponse(
        status_code=HTTPStatus.UNPROCESSABLE_ENTITY,
        content={"detail": VALIDATION_DETAIL, "code": "validation_error", "errors": errors},
    )


async def _handle_http_error(_: Request, error: StarletteHTTPException) -> JSONResponse:
    detail, code = _HTTP_DETAILS.get(error.status_code, ("Не удалось выполнить запрос.", "http_error"))
    return JSONResponse(
        status_code=error.status_code, content={"detail": detail, "code": code}, headers=error.headers
    )


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, _handle_app_error)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, _handle_validation_error)  # type: ignore[arg-type]
    app.add_exception_handler(StarletteHTTPException, _handle_http_error)  # type: ignore[arg-type]

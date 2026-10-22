const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function validateSession(value) {
  if (
    !value ||
    typeof value.ownerId !== "string" ||
    !uuid.test(value.ownerId) ||
    typeof value.accessToken !== "string" ||
    value.accessToken.length < 32 ||
    value.accessToken.length > 8192 ||
    !Array.isArray(value.fields) ||
    value.fields.length > 500 ||
    value.fields.some(
      (field) =>
        !field ||
        !["fieldId", "farmId", "cropSeasonId", "cropId"].every(
          (key) => typeof field[key] === "string" && uuid.test(field[key]),
        ) ||
        typeof field.name !== "string" ||
        !field.name.trim() ||
        field.name.length > 160,
    )
  )
    throw new Error("SESSION_INVALID");
  return value;
}

namespace ShiftPulse.Api.Endpoints;

public static class Http
{
    public static IResult Error(int status, string message) => Results.Json(new { error = message }, statusCode: status);
    public static IResult BadRequest(string message) => Error(400, message);
    public static IResult NotFound(string message = "Not found") => Error(404, message);
    public static IResult Forbidden(string message = "You don't have access to this") => Error(403, message);
    public static IResult Unauthorized() => Error(401, "Please sign in again");
}

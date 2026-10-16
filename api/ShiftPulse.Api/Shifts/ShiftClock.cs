using ShiftPulse.Api.Models;

namespace ShiftPulse.Api.Shifts;

/// <summary>Works out which shift a moment belongs to, in the team's own time zone.</summary>
public static class ShiftClock
{
    public static TimeZoneInfo Zone(ShiftSettings s)
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById(s.TimeZone); }
        catch (TimeZoneNotFoundException) { return TimeZoneInfo.Utc; }
    }

    /// <summary>The shift date (yyyy-MM-dd) for a moment: before the rollover hour counts as the previous day.</summary>
    public static string ShiftDate(ShiftSettings s, DateTime utc)
    {
        var local = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), Zone(s));
        return DateOnly.FromDateTime(local.AddHours(-s.RolloverHour)).ToString("yyyy-MM-dd");
    }

    /// <summary>When a shift date stops taking work (the rollover hour the next morning), in UTC.</summary>
    public static DateTime ShiftClosesAt(ShiftSettings s, string shiftDate)
    {
        var day = DateOnly.ParseExact(shiftDate, "yyyy-MM-dd");
        var local = day.AddDays(1).ToDateTime(new TimeOnly(s.RolloverHour, 0), DateTimeKind.Unspecified);
        return TimeZoneInfo.ConvertTimeToUtc(local, Zone(s));
    }

    public static bool IsValidDate(string? d) => DateOnly.TryParseExact(d, "yyyy-MM-dd", out _);
}

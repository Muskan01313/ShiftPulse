using ShiftPulse.Api.Models;
using ShiftPulse.Api.Services;
using ShiftPulse.Api.Shifts;

namespace ShiftPulse.Tests;

public class ShiftRulesTests
{
    private static readonly ShiftSettings Ist = new() { TimeZone = "Asia/Kolkata", Start = "15:00", End = "00:00", RolloverHour = 4 };

    // IST is UTC+5:30.
    private static DateTime Utc(int day, int hour, int minute = 0) => new(2026, 10, day, hour, minute, 0, DateTimeKind.Utc);

    [Theory]
    [InlineData(16, 9, 30, "2026-10-16")]  // 15:00 IST, shift start
    [InlineData(16, 18, 0, "2026-10-16")]  // 23:30 IST
    [InlineData(16, 19, 0, "2026-10-16")]  // 00:30 IST next day: still the 16th's shift
    [InlineData(16, 22, 29, "2026-10-16")] // 03:59 IST
    [InlineData(16, 22, 30, "2026-10-17")] // 04:00 IST: new shift day
    public void Work_before_the_rollover_hour_belongs_to_the_previous_shift(int day, int hour, int minute, string expected) =>
        Assert.Equal(expected, ShiftClock.ShiftDate(Ist, Utc(day, hour, minute)));

    [Fact]
    public void A_shift_closes_at_the_rollover_hour_the_next_morning() =>
        Assert.Equal(Utc(16, 22, 30), ShiftClock.ShiftClosesAt(Ist, "2026-10-16"));

    [Fact]
    public void A_running_timer_counts_from_its_start_time()
    {
        var t = new Ticket { TimerSeconds = 600, TimerStartedAt = Utc(16, 10) };
        Assert.Equal(600 + 3600, t.SecondsAt(Utc(16, 11)));
    }

    [Fact]
    public void Stopping_a_timer_folds_the_running_time_in()
    {
        var t = new Ticket { ShiftDate = "2026-10-16", TimerSeconds = 60, TimerStartedAt = Utc(16, 10) };
        TicketService.StopTimer(t, Utc(16, 10, 30), Ist);
        Assert.Null(t.TimerStartedAt);
        Assert.Equal(60 + 1800, t.TimerSeconds);
    }

    [Fact]
    public void A_timer_left_running_never_counts_past_the_end_of_its_shift()
    {
        // Started at 23:00 IST, laptop shut, closed two days later.
        var t = new Ticket { ShiftDate = "2026-10-16", TimerStartedAt = Utc(16, 17, 30) };
        TicketService.StopTimer(t, Utc(18, 12), Ist);
        Assert.Equal(5 * 3600, t.TimerSeconds); // 23:00 to 04:00 IST
    }

    [Fact]
    public void Completed_count_must_be_1_to_100()
    {
        TicketFields With(int? n) => new(null, null, null, null, null, n, null, null, null);
        Assert.Null(TicketService.Validate(With(null)));
        Assert.Null(TicketService.Validate(With(100)));
        Assert.NotNull(TicketService.Validate(With(0)));
        Assert.NotNull(TicketService.Validate(With(101)));
    }

    [Fact]
    public void Weeks_start_on_monday()
    {
        Assert.Equal("2026-10-12", ReportService.MondayOf("2026-10-16")); // Friday
        Assert.Equal("2026-10-12", ReportService.MondayOf("2026-10-18")); // Sunday
        Assert.Equal(7, ReportService.DaysBetween("2026-10-12", "2026-10-18").Count);
    }

    [Fact]
    public void Csv_quotes_commas_and_quotes()
    {
        var t = new Ticket { UserId = "u1", TicketNumber = "T-1", Comments = "said \"hi\", then left", TimerSeconds = 3725, ShiftDate = "2026-10-16", State = TicketStates.Submitted, ClosedBy = "Analyst" };
        var csv = ReportService.Csv([t], new Dictionary<string, string> { ["u1"] = "Priya" }, DateTime.UtcNow);
        Assert.Contains("01:02:05,T-1,", csv);
        Assert.Contains("\"said \"\"hi\"\", then left\"", csv);
        Assert.Contains(",Priya,By analyst", csv);
    }
}

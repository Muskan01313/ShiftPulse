using System.Globalization;
using System.Net;
using System.Net.Mail;
using System.Text;
using MongoDB.Driver;
using ShiftPulse.Api.Data;
using ShiftPulse.Api.Models;

namespace ShiftPulse.Api.Services;

public record AnalystSummary(
    string UserId, string Name, Dictionary<string, long> SecondsByDay, long TotalSeconds, long OpenSeconds,
    int Tickets, int Completed);

public record TeamSummary(string TeamId, string TeamName, string From, string To, List<string> Days, List<AnalystSummary> Analysts);

public class ReportService(Db db, TicketService tickets, AppSettings settings, ILogger<ReportService> log)
{
    public static List<string> DaysBetween(string from, string to)
    {
        var days = new List<string>();
        var d = DateOnly.ParseExact(from, "yyyy-MM-dd");
        var end = DateOnly.ParseExact(to, "yyyy-MM-dd");
        for (; d <= end && days.Count < 62; d = d.AddDays(1)) days.Add(d.ToString("yyyy-MM-dd"));
        return days;
    }

    public static string MondayOf(string date)
    {
        var d = DateOnly.ParseExact(date, "yyyy-MM-dd");
        return d.AddDays(-(((int)d.DayOfWeek + 6) % 7)).ToString("yyyy-MM-dd");
    }

    public async Task<TeamSummary> Summarize(Team team, string from, string to)
    {
        var now = tickets.Now;
        var f = Builders<Ticket>.Filter;
        var rows = await db.Tickets.Find(f.Eq(t => t.TeamId, team.Id) & f.Gte(t => t.ShiftDate, from) & f.Lte(t => t.ShiftDate, to)).ToListAsync();
        // Analysts, plus anyone else (a manager, say) who logged time in the period.
        var members = await db.Users.Find(u => u.TeamId == team.Id && u.IsActive && u.Role == Roles.Member).ToListAsync();
        var ids = members.Select(m => m.Id).Union(rows.Select(r => r.UserId)).Distinct().ToList();
        var names = (await db.Users.Find(u => ids.Contains(u.Id)).ToListAsync()).ToDictionary(u => u.Id, u => u.Name);

        var analysts = ids.Select(id =>
        {
            var mine = rows.Where(r => r.UserId == id).ToList();
            var byDay = mine.GroupBy(r => r.ShiftDate).ToDictionary(g => g.Key, g => g.Sum(r => r.SecondsAt(now)));
            return new AnalystSummary(
                id, names.GetValueOrDefault(id, "Unknown"), byDay,
                mine.Sum(r => r.SecondsAt(now)),
                mine.Where(r => r.State == TicketStates.Open).Sum(r => r.SecondsAt(now)),
                mine.Select(r => r.TicketNumber).Where(n => n != "").Distinct().Count(),
                mine.Sum(r => r.CompletedCount ?? 0));
        }).OrderBy(a => a.Name, StringComparer.OrdinalIgnoreCase).ToList();

        return new TeamSummary(team.Id, team.Name, from, to, DaysBetween(from, to), analysts);
    }

    public static string Hm(long seconds) => $"{seconds / 3600}h {seconds % 3600 / 60:00}m";

    public static string ToHtml(TeamSummary s, string title)
    {
        var days = s.Days.Count <= 7 ? s.Days : [];
        var sb = new StringBuilder();
        sb.Append($"<h2 style=\"font-family:Segoe UI,Arial,sans-serif\">{WebUtility.HtmlEncode(title)}</h2>");
        sb.Append("<table cellpadding=\"6\" style=\"border-collapse:collapse;font-family:Segoe UI,Arial,sans-serif;font-size:14px\">");
        sb.Append("<tr style=\"background:#eef1f5;text-align:left\"><th>Analyst</th>");
        foreach (var d in days.Count > 1 ? days : []) sb.Append($"<th>{DateOnly.ParseExact(d, "yyyy-MM-dd"):ddd d MMM}</th>");
        sb.Append("<th>Total time</th><th>Tickets</th><th>Completed</th></tr>");
        foreach (var a in s.Analysts)
        {
            sb.Append($"<tr style=\"border-top:1px solid #e2e6ec\"><td>{WebUtility.HtmlEncode(a.Name)}</td>");
            foreach (var d in days.Count > 1 ? days : []) sb.Append($"<td>{Hm(a.SecondsByDay.GetValueOrDefault(d))}</td>");
            sb.Append($"<td><b>{Hm(a.TotalSeconds)}</b></td><td>{a.Tickets}</td><td>{a.Completed}</td></tr>");
        }
        sb.Append($"<tr style=\"background:#eef1f5;font-weight:bold\"><td>Team total</td>");
        foreach (var d in days.Count > 1 ? days : []) sb.Append($"<td>{Hm(s.Analysts.Sum(a => a.SecondsByDay.GetValueOrDefault(d)))}</td>");
        sb.Append($"<td>{Hm(s.Analysts.Sum(a => a.TotalSeconds))}</td><td>{s.Analysts.Sum(a => a.Tickets)}</td><td>{s.Analysts.Sum(a => a.Completed)}</td></tr></table>");
        return sb.ToString();
    }

    /// <summary>Emails the summary to the team's report list. Returns false when email isn't set up.</summary>
    public async Task<bool> Email(Team team, string subject, string html)
    {
        if (!settings.Smtp.Enabled || team.ReportEmails.Count == 0) return false;
        using var client = new SmtpClient(settings.Smtp.Host, settings.Smtp.Port)
        {
            EnableSsl = true,
            Credentials = new NetworkCredential(settings.Smtp.User, settings.Smtp.Password),
        };
        using var msg = new MailMessage { From = new MailAddress(ParseAddress(settings.Smtp.From).address, ParseAddress(settings.Smtp.From).name), Subject = subject, Body = html, IsBodyHtml = true };
        foreach (var to in team.ReportEmails) msg.To.Add(to);
        try { await client.SendMailAsync(msg); return true; }
        catch (Exception e) { log.LogError(e, "Report email to team {Team} failed", team.Name); return false; }
    }

    private static (string name, string address) ParseAddress(string from)
    {
        var lt = from.IndexOf('<');
        return lt < 0 ? ("ShiftPulse", from.Trim()) : (from[..lt].Trim(), from[(lt + 1)..].TrimEnd('>', ' '));
    }

    public static string Csv(IEnumerable<Ticket> rows, IReadOnlyDictionary<string, string> names, DateTime nowUtc)
    {
        static string Cell(object? v)
        {
            var s = Convert.ToString(v, CultureInfo.InvariantCulture) ?? "";
            return s.IndexOfAny([',', '"', '\n', '\r']) >= 0 ? $"\"{s.Replace("\"", "\"\"")}\"" : s;
        }
        static string Clock(long s) => $"{s / 3600:00}:{s % 3600 / 60:00}:{s % 60:00}";
        var sb = new StringBuilder();
        sb.AppendLine("Recorded Time,Ticket Number,Stub Name,Domain,Analyst,New/BAU,Form Complexity,Completed Count,Total AHT,Comments,VSTS Number,Status,Date,Submitted by,How submitted");
        foreach (var t in rows)
        {
            var secs = t.SecondsAt(nowUtc);
            sb.AppendLine(string.Join(",", new object?[]
            {
                Clock(secs), t.TicketNumber, t.StubName, t.Domain, t.AnalystName, t.WorkType, t.FormComplexity,
                t.CompletedCount, Clock(secs), t.Comments, t.VstsNumber, t.Status, t.ShiftDate,
                names.GetValueOrDefault(t.UserId, ""),
                t.State == TicketStates.Open ? "Still open" : t.ClosedBy == "ShiftEnded" ? "Automatically at shift end" : "By analyst",
            }.Select(Cell)));
        }
        return sb.ToString();
    }
}

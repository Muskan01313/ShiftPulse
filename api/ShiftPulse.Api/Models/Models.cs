using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace ShiftPulse.Api.Models;

public static class Roles
{
    public const string Member = "Member";
    public const string Manager = "Manager";
    public const string Admin = "Admin";
    public static readonly string[] All = [Member, Manager, Admin];
}

public class User
{
    [BsonId, BsonRepresentation(BsonType.ObjectId)] public string Id { get; set; } = ObjectId.GenerateNewId().ToString();
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string Role { get; set; } = Roles.Member;
    [BsonRepresentation(BsonType.ObjectId)] public string? TeamId { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class ShiftSettings
{
    /// <summary>IANA time zone the shift is planned in.</summary>
    public string TimeZone { get; set; } = "Asia/Kolkata";
    public string Start { get; set; } = "15:00";
    public string End { get; set; } = "00:00";
    /// <summary>Work logged before this hour (local) still belongs to the previous day's shift.</summary>
    public int RolloverHour { get; set; } = 4;
}

public class Team
{
    [BsonId, BsonRepresentation(BsonType.ObjectId)] public string Id { get; set; } = ObjectId.GenerateNewId().ToString();
    public string Name { get; set; } = "";
    [BsonRepresentation(BsonType.ObjectId)] public List<string> ManagerIds { get; set; } = [];
    public ShiftSettings Shift { get; set; } = new();
    public TeamOptions Options { get; set; } = TeamOptions.Defaults();
    /// <summary>Who gets the daily and weekly summary emails.</summary>
    public List<string> ReportEmails { get; set; } = [];
}

/// <summary>The dropdown choices a team's analysts pick from.</summary>
public class TeamOptions
{
    public List<string> WorkTypes { get; set; } = [];
    public List<string> Complexities { get; set; } = [];
    public List<string> Statuses { get; set; } = [];

    public static TeamOptions Defaults() => new()
    {
        WorkTypes = ["New", "BAU", "Others"],
        Complexities =
        [
            "Simple", "Simple - Multi Response", "Medium", "Medium - Multi Response", "Medium - Term Base",
            "Medium - Instance Base", "Medium - Instance Base with terms", "Complex", "Complex - Term Base",
            "Complex - Instance Base with terms",
        ],
        Statuses =
        [
            "Completed", "Not Started", "On Hold Client Input", "Future Delivery", "On Hold CSS/AM", "Transferred",
            "On Hold PO", "WIP", "On Hold Dev",
        ],
    };
}

public static class TicketStates
{
    public const string Open = "Open";
    public const string Submitted = "Submitted";
}

public class Ticket
{
    [BsonId, BsonRepresentation(BsonType.ObjectId)] public string Id { get; set; } = ObjectId.GenerateNewId().ToString();
    [BsonRepresentation(BsonType.ObjectId)] public string UserId { get; set; } = "";
    [BsonRepresentation(BsonType.ObjectId)] public string? TeamId { get; set; }
    /// <summary>The shift this work belongs to, as yyyy-MM-dd in the team's time zone.</summary>
    public string ShiftDate { get; set; } = "";
    public string TicketNumber { get; set; } = "";
    public string StubName { get; set; } = "";
    public string Domain { get; set; } = "";
    public string AnalystName { get; set; } = "";
    public string WorkType { get; set; } = "";
    public string FormComplexity { get; set; } = "";
    public int? CompletedCount { get; set; }
    public string Comments { get; set; } = "";
    public string VstsNumber { get; set; } = "";
    public string Status { get; set; } = "";
    /// <summary>Finished timer time; a running timer adds (now - TimerStartedAt).</summary>
    public long TimerSeconds { get; set; }
    public DateTime? TimerStartedAt { get; set; }
    public string State { get; set; } = TicketStates.Open;
    public DateTime? SubmittedAt { get; set; }
    /// <summary>"Analyst" or "ShiftEnded".</summary>
    public string? ClosedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public long SecondsAt(DateTime nowUtc) =>
        TimerSeconds + (TimerStartedAt is { } s ? Math.Max(0, (long)(nowUtc - s).TotalSeconds) : 0);
}

public class Tenant
{
    [BsonId] public string TenantId { get; set; } = "";
    /// <summary>Program captions (the "Domain" choices), in the order of the tenant sheet.</summary>
    public List<string> Programs { get; set; } = [];
    public bool IsActive { get; set; } = true;
}

public class AuditEntry
{
    [BsonId, BsonRepresentation(BsonType.ObjectId)] public string Id { get; set; } = ObjectId.GenerateNewId().ToString();
    [BsonRepresentation(BsonType.ObjectId)] public string ActorId { get; set; } = "";
    [BsonRepresentation(BsonType.ObjectId)] public string TicketId { get; set; } = "";
    public string Change { get; set; } = "";
    public DateTime At { get; set; } = DateTime.UtcNow;
}

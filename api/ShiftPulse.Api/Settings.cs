namespace ShiftPulse.Api;

public class AppSettings
{
    public string MongoUri { get; set; } = "mongodb://localhost:27017";
    public string MongoDatabase { get; set; } = "shiftpulse";
    /// <summary>Signs login tokens. At least 32 characters; keep it secret.</summary>
    public string JwtSecret { get; set; } = "";
    public int TokenHours { get; set; } = 14;
    /// <summary>Shared secret the scheduled jobs send in the X-Job-Key header.</summary>
    public string JobKey { get; set; } = "";
    /// <summary>Comma-separated origins allowed to call the API (the web app's URL).</summary>
    public string CorsOrigins { get; set; } = "http://localhost:5173";
    /// <summary>First admin, created on startup when there are no users yet.</summary>
    public string? BootstrapAdminEmail { get; set; }
    public string? BootstrapAdminPassword { get; set; }
    public string BootstrapAdminName { get; set; } = "Admin";
    public SmtpSettings Smtp { get; set; } = new();
}

public class SmtpSettings
{
    public string? Host { get; set; }
    public int Port { get; set; } = 587;
    public string? User { get; set; }
    public string? Password { get; set; }
    public string From { get; set; } = "ShiftPulse <no-reply@example.com>";
    public bool Enabled => !string.IsNullOrWhiteSpace(Host);
}

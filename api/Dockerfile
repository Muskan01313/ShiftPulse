# Build: docker build -t shiftpulse-api ./api
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ShiftPulse.Api/ShiftPulse.Api.csproj ShiftPulse.Api/
RUN dotnet restore ShiftPulse.Api/ShiftPulse.Api.csproj
COPY ShiftPulse.Api/ ShiftPulse.Api/
RUN dotnet publish ShiftPulse.Api/ShiftPulse.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app .
EXPOSE 8080
USER app
# Render (and most hosts) pass the port in $PORT.
ENTRYPOINT ["sh", "-c", "ASPNETCORE_URLS=http://+:${PORT:-8080} exec dotnet ShiftPulse.Api.dll"]

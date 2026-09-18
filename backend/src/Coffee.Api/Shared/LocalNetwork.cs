using System.Net;
using System.Net.Sockets;

namespace Coffee.Api.Shared;

/// <summary>Local-network helpers for development.</summary>
internal static class LocalNetwork
{
    /// <summary>
    /// This machine's primary LAN IPv4 (the source address used to reach the internet), or null.
    /// Presigned MinIO URLs are handed to a phone on the same Wi-Fi, where <c>localhost</c> is the
    /// phone itself — so in dev the S3 endpoint is rewritten to this address. Resolved per start,
    /// so a new Wi-Fi network needs no config edit.
    /// </summary>
    public static string? PrimaryIPv4()
    {
        try
        {
            using var socket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);
            socket.Connect("8.8.8.8", 65530); // no packets are sent; this only selects the default-route source IP
            return (socket.LocalEndPoint as IPEndPoint)?.Address.ToString();
        }
        catch (SocketException)
        {
            return null;
        }
    }
}

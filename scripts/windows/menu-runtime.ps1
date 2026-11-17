param(
  [Parameter(Mandatory = $true)][string]$App,
  [Parameter(Mandatory = $true)][string]$Out,
  [ValidateSet("Menu", "Sleep", "SeedMenu", "SeedSleep")][string]$Mode = "Menu",
  [int]$BudgetSeconds = 400
)

$ErrorActionPreference = "Stop"
$started = Get-Date
$deadline = $started.AddSeconds($BudgetSeconds)
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$Out = (Resolve-Path -LiteralPath $Out).Path
$App = (Resolve-Path -LiteralPath $App).Path
$shots = Join-Path $Out "shots"
New-Item -ItemType Directory -Force -Path $shots | Out-Null
$dataRoot = Join-Path (Split-Path -Parent $Out) "menu-runtime-data-$Mode-$PID"
$appLog = Join-Path $Out "ardia.log"
$runLog = Join-Path $Out "runtime.log"
$resultsFile = Join-Path $Out "results.json"
$summaryFile = Join-Path $Out "summary.md"

$script:Tests = [System.Collections.Generic.List[object]]::new()
$script:Facts = [System.Collections.Generic.List[string]]::new()
$script:Shot = 0
$script:Session = $null
$script:Recorder = $null
$script:Server = $null
$script:Front = @{}
$script:RowPaths = @{
  "Probe Alpha" = "/alpha"; "Probe Bravo" = "/bravo"; "Probe Field" = "/field"; "Probe Form" = "/form"; "Probe Audio" = "/audio"; "Probe Second" = "/second"
  "Seed Control A" = "/control-a"; "Seed Control B" = "/control-b"; "Seed Outside" = "/outside-a"; "Seed Pin" = "/pin"; "Seed Video" = "/pip"
  "Seed Nested A" = "/nested-a"; "Seed Nested B" = "/nested-b"; "Seed Nested C" = "/nested-c"
}
$SeedVideo = "GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAhBEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggEwTbuMU6uEHFO7a1Osgggr7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjMuMS4xMDJXQYxMYXZmNjMuMS4xMDJEiYhAp3AAAAAAABZUrmvVrgEAAAAAAABM14EBc8WIrNRc0sc4PW2cgQAitZyDdW5khoVWX1ZQOIOBASPjg4QD+UCq4JGwggFAuoG0moECVbCEVbmBAVXugQDsAQAAAAAAAAIAABJUw2dA9nNz+mPAgGfIlUWji01BSk9SX0JSQU5ERIeEaXNvbWfIlkWjjU1JTk9SX1ZFUlNJT05Eh4M1MTJnyKdFo5FDT01QQVRJQkxFX0JSQU5EU0SHkGlzb21pc28yYXZjMW1wNDFnyJlFo4dFTkNPREVSRIeMTGF2ZjYzLjEuMTAyc3P2Y8CLY8WIrNRc0sc4PW1nyKBFo4dFTkNPREVSRIeTTGF2YzYzLjEuMTAyIGxpYnZweGfInkWjjEhBTkRMRVJfTkFNRUSHjFZpZGVvSGFuZGxlcmfIoUWjiERVUkFUSU9ORIeTMDA6MDA6MDMuMDAwMDAwMDAwAB9DtnVF+eeBAKNAo4EAAICQDwCdASpAAbQAAEcIhYWIhYSIAgICdaoD+AIGhoT3BoFkn2vbmyc4eyc4eyc4eyc4eyc4eyc4eyc4eyc4eyc4eyc4eyc4eyc4eyc4eyc4eyc4eyc4eyc4eyc4eyc4eyc4eyc4eyc4eyc4eyc4eyc4eyc4eyc4eyc4eyc4eyc4eyc4eycuAP7/TRL//FhX8WFfxYV/8WFf/PzO7cX85gCjnYEAQwCxAgAHEOwAGAAYWC/0AAiABDNfrXJPlYAAo52BAIUAsQIABxDsABgAGFgv9AAIgAQzX61yT5WAAKOdgQDIALECAAcQ7AAYABhYL/QACIAEM1+tck+VgACjnYEBCwCxAgAHEOwAGAAYWC/0AAiABDNfrXJPlYAAo52BAU0AsQIABxDsABgAGFgv9AAIgAQzX61yT5WAAKOdgQGQALECAAcQ7AAYABhYL/QACIAEM1+tck+VgACjnIEB0wCRAgAHEBAUYABhYL/QACIAEM1+tck+VgCjnYECFQCxAgAHEOwAGAAYWC/0AAiABDNfrXJPlYAAo52BAlgAsQIABxDsABgAGFgv9AAIgAQzX61yT5WAAKOdgQKbALECAAcQ7AAYABhYL/QACIAEM1+tck+VgACjnYEC3QCxAgAHEOwAGAAYWC/0AAiABDNfrXJPlYAAo52BAyAAsQIABxDsABgAGFgv9AAIgAQzX61yT5WAAKOdgQNjALECAAcQ7AAYABhYL/QACIAEM1+tck+VgACjnYEDpQCxAgAHEOwAGAAYWC/0AAiABDNfrXJPlYAAo52BA+gAsQIABxDsABgAGFgv9AAIgAQzX61yT5WAAKOdgQQrALECAAcQ7AAYABhYL/QACIAEM1+tck+VgACjnYEEbQCxAgAHEOwAGAAYWC/0AAiABDNfrXJPlYAAo5yBBLAAkQIABxAQFGAAYWC/0AAiABDNfrXJPlYAo52BBPMAsQIABxDsABgAGFgv9AAIgAQzX61yT5WAAKOdgQU1ALECAAcQ7AAYABhYL/QACIAEM1+tck+VgACjnYEFeACxAgAHEOwAGAAYWC/0AAiABDNfrXJPlYAAo52BBbsAsQIABxDsABgAGFgv9AAIgAQzX61yT5WAAKOdgQX9ALECAAcQ7AAYABhYL/QACIAEM1+tck+VgACjnYEGQACxAgAHEOwAGAAYWC/0AAiABDNfrXJPlYAAo52BBoMAsQIABxDsABgAGFgv9AAIgAQzX61yT5WAAKOdgQbFALECAAcQ7AAYABhYL/QACIAEM1+tck+VgACjnYEHCACxAgAHEOwAGAAYWC/0AAiABDNfrXJPlYAAo52BB0sAsQIABxDsABgAGFgv9AAIgAQzX61yT5WAAKOcgQeNAJECAAcQEBRgAGFgv9AAIgAQzX61yT5WAKOdgQfQALECAAcQ7AAYABhYL/QACIAEM1+tck+VgACjnYEIEwCxAgAHEOwAGAAYWC/0AAiABDNfrXJPlYAAo52BCFUAsQIABxDsABgAGFgv9AAIgAQzX61yT5WAAKOdgQiYALECAAcQ7AAYABhYL/QACIAEM1+tck+VgACjnYEI2wCxAgAHEOwAGAAYWC/0AAiABDNfrXJPlYAAo52BCR0AsQIABxDsABgAGFgv9AAIgAQzX61yT5WAAKOdgQlgALECAAcQ7AAYABhYL/QACIAEM1+tck+VgACjnYEJowCxAgAHEOwAGAAYWC/0AAiABDNfrXJPlYAAo52BCeUAsQIABxDsABgAGFgv9AAIgAQzX61yT5WAAKOdgQooALECAAcQ7AAYABhYL/QACIAEM1+tck+VgACjnIEKawCRAgAHEBAUYABhYL/QACIAEM1+tck+VgCjnYEKrQCxAgAHEOwAGAAYWC/0AAiABDNfrXJPlYAAo52BCvAAsQIABxDsABgAGFgv9AAIgAQzX61yT5WAAKOdgQszALECAAcQ7AAYABhYL/QACIAEM1+tck+VgACjnYELdQCxAgAHEOwAGAAYWC/0AAiABDNfrXJPlYAAHFO7a5G7j7OBALeK94EB8YICLPCBAw=="

if (-not ([System.Management.Automation.PSTypeName]"MenuProbe").Type) {
  Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.IO;
using System.Net.WebSockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class MenuProbe {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct Point { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] struct MouseInput { public int Dx, Dy; public uint Data, Flags, Time; public IntPtr Extra; }
  [StructLayout(LayoutKind.Sequential)] struct KeyInput { public ushort Vk, Scan; public uint Flags, Time; public IntPtr Extra; }
  [StructLayout(LayoutKind.Explicit)] struct InputUnion { [FieldOffset(0)] public MouseInput Mouse; [FieldOffset(0)] public KeyInput Key; }
  [StructLayout(LayoutKind.Sequential)] struct Input { public uint Type; public InputUnion U; }

  public class TopWindow { public IntPtr Handle; public string Title; public string ClassName; public int Left, Top, Width, Height; }

  delegate bool EnumWindowsCallback(IntPtr window, IntPtr data);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsCallback callback, IntPtr data);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowTextW(IntPtr window, StringBuilder text, int max);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassNameW(IntPtr window, StringBuilder text, int max);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr window, int attribute, out int value, int size);
  [DllImport("user32.dll")] static extern uint SendInput(uint count, Input[] inputs, int size);
  [DllImport("user32.dll")] static extern IntPtr SendMessageTimeoutW(IntPtr window, uint message, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out IntPtr result);
  [DllImport("user32.dll")] static extern int GetMenuItemCount(IntPtr menu);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetMenuStringW(IntPtr menu, uint item, StringBuilder text, int max, uint flags);
  [DllImport("user32.dll")] static extern uint GetMenuState(IntPtr menu, uint item, uint flags);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr window);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr window);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr window, uint command);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out Rect rect);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr window, out Rect rect);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr window, ref Point point);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr window);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr window);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr window, int command);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
  [DllImport("user32.dll")] public static extern bool PostMessageW(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern uint MapVirtualKeyW(uint code, uint mapType);
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();

  public static string TitleOf(IntPtr window) { var text = new StringBuilder(512); GetWindowTextW(window, text, text.Capacity); return text.ToString(); }
  public static string ClassOf(IntPtr window) { var text = new StringBuilder(256); GetClassNameW(window, text, text.Capacity); return text.ToString(); }
  public static uint ProcessOf(IntPtr window) { uint id; GetWindowThreadProcessId(window, out id); return id; }
  static bool Cloaked(IntPtr window) { int value; return DwmGetWindowAttribute(window, 14, out value, 4) == 0 && value != 0; }

  public static TopWindow[] VisibleWindowsOf(uint processId) {
    var found = new List<TopWindow>();
    EnumWindowsCallback callback = delegate (IntPtr window, IntPtr data) {
      if (ProcessOf(window) != processId || !IsWindowVisible(window) || Cloaked(window)) return true;
      Rect rect;
      if (!GetWindowRect(window, out rect) || rect.Right <= rect.Left || rect.Bottom <= rect.Top) return true;
      found.Add(new TopWindow { Handle = window, Title = TitleOf(window), ClassName = ClassOf(window), Left = rect.Left, Top = rect.Top, Width = rect.Right - rect.Left, Height = rect.Bottom - rect.Top });
      return true;
    };
    EnumWindows(callback, IntPtr.Zero);
    GC.KeepAlive(callback);
    return found.ToArray();
  }

  public static string[] MenuItems(IntPtr window) {
    IntPtr menu;
    if (SendMessageTimeoutW(window, 0x01E1, IntPtr.Zero, IntPtr.Zero, 2, 1000, out menu) == IntPtr.Zero || menu == IntPtr.Zero) return new string[0];
    int count = GetMenuItemCount(menu);
    var items = new List<string>();
    for (uint i = 0; i < count && i < 128; i++) {
      var text = new StringBuilder(256);
      GetMenuStringW(menu, i, text, text.Capacity, 0x400);
      uint state = GetMenuState(menu, i, 0x400);
      items.Add(state.ToString() + "\t" + text.ToString());
    }
    return items.ToArray();
  }

  static void Send(Input[] inputs) { SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(Input))); }

  public static void TypeText(string text) {
    foreach (char c in text) {
      var down = new Input { Type = 1 };
      down.U.Key = new KeyInput { Scan = c, Flags = 4 };
      var up = new Input { Type = 1 };
      up.U.Key = new KeyInput { Scan = c, Flags = 6 };
      Send(new[] { down, up });
      Thread.Sleep(35);
    }
  }
}

public sealed class CdpSession : IDisposable {
  readonly ClientWebSocket socket = new ClientWebSocket();
  readonly List<string> events = new List<string>();
  int next;
  readonly bool pageConnection;
  int disposed;
  static int openPageConnections;
  static int unconfirmedPageCloses;
  public static int OpenPageConnections { get { return Volatile.Read(ref openPageConnections); } }
  public static int UnconfirmedPageCloses { get { return Volatile.Read(ref unconfirmedPageCloses); } }

  public CdpSession(string url, int timeoutMs) {
    var endpoint = new Uri(url);
    socket.Options.Proxy = null;
    using (var cancel = new CancellationTokenSource(timeoutMs)) socket.ConnectAsync(endpoint, cancel.Token).GetAwaiter().GetResult();
    pageConnection = endpoint.AbsolutePath.StartsWith("/devtools/page/", StringComparison.Ordinal);
    if (pageConnection) Interlocked.Increment(ref openPageConnections);
  }

  System.Threading.Tasks.Task<string> pending;

  async System.Threading.Tasks.Task<string> ReadMessage() {
    var buffer = new byte[65536];
    var message = new MemoryStream();
    while (true) {
      var read = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None).ConfigureAwait(false);
      if (read.MessageType == WebSocketMessageType.Close) throw new IOException("the DevTools socket closed");
      message.Write(buffer, 0, read.Count);
      if (read.EndOfMessage) return Encoding.UTF8.GetString(message.ToArray());
    }
  }

  string Next(int timeoutMs) {
    if (pending == null) pending = ReadMessage();
    if (!pending.Wait(Math.Max(0, timeoutMs))) return null;
    var done = pending;
    pending = null;
    return done.GetAwaiter().GetResult();
  }

  public string Send(string method, string parameters, int timeoutMs) {
    int id = ++next;
    var bytes = Encoding.UTF8.GetBytes("{\"id\":" + id + ",\"method\":\"" + method + "\",\"params\":" + (string.IsNullOrEmpty(parameters) ? "{}" : parameters) + "}");
    if (!socket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None).Wait(timeoutMs)) throw new TimeoutException(method + " could not be sent in " + timeoutMs + " ms");
    var until = DateTime.UtcNow.AddMilliseconds(timeoutMs);
    string prefix = "{\"id\":" + id + ",";
    while (true) {
      string message = Next((int)(until - DateTime.UtcNow).TotalMilliseconds);
      if (message == null) throw new TimeoutException(method + " got no answer in " + timeoutMs + " ms");
      if (message.StartsWith(prefix)) return message;
      events.Add(message);
    }
  }

  public string WaitEvent(string method, int timeoutMs) {
    string marker = "\"method\":\"" + method + "\"";
    foreach (var seen in events) if (seen.Contains(marker)) return seen;
    var until = DateTime.UtcNow.AddMilliseconds(timeoutMs);
    while (true) {
      string message = Next((int)(until - DateTime.UtcNow).TotalMilliseconds);
      if (message == null) return null;
      events.Add(message);
      if (message.Contains(marker)) return message;
    }
  }

  public void Dispose() {
    if (Interlocked.Exchange(ref disposed, 1) != 0) return;
    bool acknowledged = false;
    try {
      using (var cancel = new CancellationTokenSource(1500)) socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "", cancel.Token).GetAwaiter().GetResult();
      var until = DateTime.UtcNow.AddMilliseconds(1500);
      while (DateTime.UtcNow < until) {
        if (socket.State == WebSocketState.Closed || socket.State == WebSocketState.CloseReceived) { acknowledged = true; break; }
        if (pending == null) pending = ReadMessage();
        try {
          if (!pending.Wait(Math.Max(1, (int)(until - DateTime.UtcNow).TotalMilliseconds))) break;
          pending.GetAwaiter().GetResult();
          pending = null;
        } catch {
          acknowledged = socket.State == WebSocketState.Closed || socket.State == WebSocketState.CloseReceived;
          break;
        }
      }
    } catch { acknowledged = socket.State == WebSocketState.Closed || socket.State == WebSocketState.CloseReceived; }
    finally {
      socket.Dispose();
      if (pageConnection) {
        if (!acknowledged) Interlocked.Increment(ref unconfirmedPageCloses);
        Interlocked.Decrement(ref openPageConnections);
      }
    }
  }
}
"@
}

[MenuProbe]::SetProcessDPIAware() | Out-Null
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
. (Join-Path $PSScriptRoot "process-tree.ps1")

function Note([string]$Text) {
  $line = "[{0,6:N1}s] {1}" -f ((Get-Date) - $started).TotalSeconds, $Text
  Write-Host $line
  Add-Content -LiteralPath $runLog -Value $line -Encoding utf8NoBOM
}

function Read-AppLog {
  if (-not (Test-Path -LiteralPath $appLog)) { return @() }
  try {
    $stream = [System.IO.File]::Open($appLog, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete)
    try { $text = [System.IO.StreamReader]::new($stream).ReadToEnd() } finally { $stream.Dispose() }
    return @($text -split "`r?`n" | Where-Object { $_ -ne "" })
  } catch { return @() }
}

function Get-LogMark { return @(Read-AppLog).Count }
function Get-LinesSince([int]$Mark, [string]$Pattern) { return @(Read-AppLog | Select-Object -Skip $Mark | Where-Object { $_ -match $Pattern }) }

function Test-Alive { return $script:Session -and -not $script:Session.Process.HasExited }

function Wait-For([scriptblock]$Condition, [int]$Milliseconds) {
  $until = (Get-Date).AddMilliseconds($Milliseconds)
  while ($true) {
    $value = & $Condition
    if ($value) { return $value }
    if ((Get-Date) -ge $until) { return $null }
    Start-Sleep -Milliseconds 120
  }
}

function Get-OurWindows {
  if (-not (Test-Alive)) { return @() }
  try { return @([MenuProbe]::VisibleWindowsOf([uint32]$script:Session.Process.Id)) } catch { return @() }
}

function Get-AppWindows { return @(Get-OurWindows | Where-Object { $_.ClassName -notlike "Chrome_*" -and $_.ClassName -notin @("#32768", "#32770") -and $_.Width -ge 300 -and $_.Height -ge 200 }) }
function Get-MenuWindows { return @(Get-OurWindows | Where-Object { $_.ClassName -eq "#32768" }) }
function Get-DialogWindows { return @(Get-OurWindows | Where-Object { $_.ClassName -eq "#32770" }) }

function Get-Client([IntPtr]$Window) {
  if ($Window -eq [IntPtr]::Zero -or -not [MenuProbe]::IsWindow($Window)) { return $null }
  $origin = New-Object MenuProbe+Point
  $size = New-Object MenuProbe+Rect
  if (-not [MenuProbe]::ClientToScreen($Window, [ref]$origin) -or -not [MenuProbe]::GetClientRect($Window, [ref]$size)) { return $null }
  $dpi = [MenuProbe]::GetDpiForWindow($Window)
  return [pscustomobject]@{ X = $origin.X; Y = $origin.Y; Width = $size.Right; Height = $size.Bottom; Scale = $(if ($dpi) { $dpi / 96.0 } else { 1.0 }) }
}

function Get-PagePoint([IntPtr]$Window) {
  $client = Get-Client $Window
  return [pscustomobject]@{ X = $client.X + [int]($client.Width * 0.68); Y = $client.Y + [int]($client.Height * 0.55) }
}

function Test-ForegroundOurs {
  $foreground = [MenuProbe]::GetForegroundWindow()
  return $foreground -ne [IntPtr]::Zero -and [MenuProbe]::ProcessOf($foreground) -eq [uint32]$script:Session.Process.Id
}

function Describe-Foreground {
  $foreground = [MenuProbe]::GetForegroundWindow()
  if ($foreground -eq [IntPtr]::Zero) { return "no window" }
  return "'$([MenuProbe]::TitleOf($foreground))' ($([MenuProbe]::ClassOf($foreground)), pid $([MenuProbe]::ProcessOf($foreground)))"
}

function Send-Key([byte]$Key, [uint32]$Flags) {
  $scan = [byte]([MenuProbe]::MapVirtualKeyW([uint32]$Key, 0) -band 0xFF)
  [MenuProbe]::keybd_event($Key, $scan, $Flags, [UIntPtr]::Zero)
}

function Send-Tap([byte]$Key) {
  Send-Key $Key 0
  Start-Sleep -Milliseconds 40
  Send-Key $Key 2
  Start-Sleep -Milliseconds 200
}

function Send-Chord([byte[]]$Modifiers, [byte]$Key) {
  foreach ($modifier in $Modifiers) { Send-Key $modifier 0 }
  Start-Sleep -Milliseconds 50
  Send-Tap $Key
  foreach ($modifier in $Modifiers) { Send-Key $modifier 2 }
  Start-Sleep -Milliseconds 300
}

function Release-Modifiers {
  foreach ($key in @(0x10, 0x11, 0x12, 0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5)) {
    if ([MenuProbe]::GetAsyncKeyState($key) -band 0x8000) { Send-Key ([byte]$key) 2 }
  }
}

function Send-Click([int]$X, [int]$Y, [switch]$Right, [int]$HoldMs = 60) {
  $down = if ($Right) { 8 } else { 2 }
  [MenuProbe]::SetCursorPos($X, $Y) | Out-Null
  Start-Sleep -Milliseconds 120
  [MenuProbe]::mouse_event([uint32]$down, 0, 0, 0, [UIntPtr]::Zero)
  try { Start-Sleep -Milliseconds $HoldMs }
  finally { [MenuProbe]::mouse_event([uint32]($down * 2), 0, 0, 0, [UIntPtr]::Zero) }
  Start-Sleep -Milliseconds 250
}

function Save-Shot($Test, [string]$Name) {
  $script:Shot++
  $file = Join-Path $shots ("{0:D3}-{1}.png" -f $script:Shot, $Name)
  try {
    $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
    $bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
      $bitmap.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
    if ($Test) { $Test.shots.Add((Split-Path -Leaf $file)) }
  } catch {
    if ($Test) { $Test.facts.Add("screenshot $Name failed: $($_.Exception.Message)") }
  }
}

function Focus-Window([IntPtr]$Window) {
  if (-not [MenuProbe]::IsWindow($Window)) { return $false }
  if ([MenuProbe]::IsIconic($Window)) { [MenuProbe]::ShowWindow($Window, 9) | Out-Null }
  for ($attempt = 0; $attempt -lt 3; $attempt++) {
    if ([MenuProbe]::GetForegroundWindow() -eq $Window) { return $true }
    Send-Key 0x12 0
    Send-Key 0x12 2
    [MenuProbe]::SetForegroundWindow($Window) | Out-Null
    [MenuProbe]::BringWindowToTop($Window) | Out-Null
    Start-Sleep -Milliseconds 300
  }
  if ([MenuProbe]::GetForegroundWindow() -eq $Window) { return $true }
  $client = Get-Client $Window
  if ($client) {
    Send-Click ($client.X + [int]($client.Width * 0.5)) ($client.Y + [int](14 * $client.Scale))
    Start-Sleep -Milliseconds 300
  }
  return [MenuProbe]::GetForegroundWindow() -eq $Window
}

function Close-Menus {
  for ($i = 0; $i -lt 4 -and @(Get-MenuWindows).Count; $i++) { Send-Tap 0x1B; Start-Sleep -Milliseconds 200 }
}

function Initialize-Uia {
  if ($null -ne $script:UiaReady) { return $script:UiaReady }
  try { Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes; $script:UiaReady = $true } catch { $script:UiaReady = $false }
  return $script:UiaReady
}

function Get-PageWindow([IntPtr]$Window) {
  $frame = New-Object MenuProbe+Rect
  if ($Window -eq [IntPtr]::Zero -or -not [MenuProbe]::GetWindowRect($Window, [ref]$frame)) { return $null }
  $best = $null
  $bestArea = 0
  foreach ($candidate in @(Get-OurWindows)) {
    if ($candidate.ClassName -notlike "Chrome_WidgetWin_*" -or [MenuProbe]::GetWindow($candidate.Handle, 4) -ne $Window) { continue }
    $width = [Math]::Min($frame.Right, $candidate.Left + $candidate.Width) - [Math]::Max($frame.Left, $candidate.Left)
    $height = [Math]::Min($frame.Bottom, $candidate.Top + $candidate.Height) - [Math]::Max($frame.Top, $candidate.Top)
    $area = [Math]::Max(0, $width) * [Math]::Max(0, $height)
    if ($area -gt $bestArea) { $best = $candidate; $bestArea = $area }
  }
  return $best
}

function Get-SidebarBounds([IntPtr]$Window) {
  $client = Get-Client $Window
  if (-not $client) { return $null }
  $page = Get-PageWindow $Window
  if ($page -and $page.Left -gt $client.X) {
    return [pscustomobject]@{ Left = $client.X; Right = $page.Left; Top = $client.Y; Bottom = $client.Y + $client.Height; Scale = $client.Scale; Source = "left of page window $("0x{0:x}" -f $page.Handle.ToInt64()) at x=$($page.Left)" }
  }
  return [pscustomobject]@{ Left = $client.X; Right = $client.X + [int]($client.Width * 0.4); Top = $client.Y; Bottom = $client.Y + $client.Height; Scale = $client.Scale; Source = "no owned page window, so the left 40% of the client" }
}

function Find-Row([IntPtr]$Window, [string]$Name, [int]$Attempts = 12) {
  if (-not (Initialize-Uia)) { return $null }
  for ($attempt = 0; $attempt -lt $Attempts; $attempt++) {
    try {
      $bounds = Get-SidebarBounds $Window
      if (-not $bounds) { return $null }
      $root = [System.Windows.Automation.AutomationElement]::FromHandle($Window)
      $condition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, $Name)
      foreach ($element in $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)) {
        $current = $element.Current
        if ($current.ControlType -eq [System.Windows.Automation.ControlType]::Document) { continue }
        $box = $current.BoundingRectangle
        if ($box.IsEmpty -or $box.Width -le 0 -or $box.Height -le 0 -or $current.IsOffscreen) { continue }
        if ($box.X -lt $bounds.Left - 2 -or $box.Right -gt $bounds.Right + 2 -or $box.Y -lt $bounds.Top - 2 -or $box.Bottom -gt $bounds.Bottom + 2) { continue }
        $x = [int]($box.X + [Math]::Min(40 * $bounds.Scale, $box.Width / 2))
        return [pscustomobject]@{ X = $x; Y = [int]($box.Y + $box.Height / 2); Bound = $bounds.Source; ControlType = $current.ControlType.ProgrammaticName }
      }
    } catch { }
    if ($attempt + 1 -lt $Attempts) { Start-Sleep -Milliseconds 250 }
  }
  return $null
}

function Find-VisibleText([string]$Text) {
  if (-not (Initialize-Uia)) { return $null }
  foreach ($window in @(Get-OurWindows)) {
    try {
      $root = [System.Windows.Automation.AutomationElement]::FromHandle($window.Handle)
      $condition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, $Text)
      foreach ($element in $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)) {
        $box = $element.Current.BoundingRectangle
        if (-not $element.Current.IsOffscreen -and -not $box.IsEmpty -and $box.Width -gt 0 -and $box.Height -gt 0) {
          return [pscustomobject]@{ Window = $window.Handle.ToInt64(); ClassName = $window.ClassName; Text = $element.Current.Name; X = $box.X; Y = $box.Y; Width = $box.Width; Height = $box.Height }
        }
      }
    } catch { }
  }
  return $null
}

function Get-MenuItems([IntPtr]$Menu) {
  $items = @()
  $index = 0
  foreach ($raw in [MenuProbe]::MenuItems($Menu)) {
    $parts = $raw -split "`t", 2
    $state = [uint32]$parts[0]
    $text = if ($parts.Count -gt 1) { $parts[1] } else { "" }
    $items += [pscustomobject]@{ Index = $index; Text = ($text -split "`t")[0]; Grayed = ($state -band 3) -ne 0; Separator = ($state -band 0x800) -ne 0; Hilite = ($state -band 0x80) -ne 0 }
    $index++
  }
  return @($items)
}

function Format-Items($Items) { return (@($Items | Where-Object { -not $_.Separator } | ForEach-Object { $_.Text + $(if ($_.Grayed) { " (grey)" } else { "" }) }) -join " | ") }

function Open-Menu($Test, [IntPtr]$Window, [string]$Row, [switch]$KeepModifiers, [int]$HoldMs = 60) {
  if (-not $KeepModifiers) {
    Release-Modifiers
    Close-Menus
    Focus-Window $Window | Out-Null
  }
  $point = Find-Row $Window $Row
  if (-not $point) {
    $Test.facts.Add("no sidebar row named '$Row' was found by UI Automation")
    return $null
  }
  $mark = Get-LogMark
  Send-Click $point.X $point.Y -Right -HoldMs $HoldMs
  $menu = Wait-For { $found = @(Get-MenuWindows); if ($found.Count -and (Get-LinesSince $mark '^menu \d+ pop-up menu shown').Count) { $found[0] } } 4000
  $asked = @(Get-LinesSince $mark '^menu \d+ (showMenu asked|pop-up menu)')
  $Test.facts.Add("right-clicked '$Row' ($($point.ControlType), sidebar bound: $($point.Bound)) at $($point.X),$($point.Y); menu log: $(if ($asked.Count) { $asked -join ' / ' } else { 'none' })")
  if (-not $menu) { return $null }
  $items = Get-MenuItems $menu.Handle
  $Test.facts.Add("menu items: $(Format-Items $items)")
  return [pscustomobject]@{ Handle = $menu.Handle; Mark = $mark; Items = $items }
}

function Wait-MenuClosed($Menu, [int]$Milliseconds = 3000) {
  return [bool](Wait-For { -not @(Get-MenuWindows).Count -and (Get-LinesSince $Menu.Mark '^menu \d+ pop-up menu (dismissed|chose|failed)').Count } $Milliseconds)
}

function Get-MenuOutcome($Menu) { $lines = @(Get-LinesSince $Menu.Mark '^menu \d+ pop-up menu (dismissed|chose|failed)'); if ($lines.Count) { return $lines[-1] } return "" }

function Select-MenuItem($Test, $Menu, [string]$Text) {
  $wanted = @($Menu.Items | Where-Object { -not $_.Separator -and $_.Text -eq $Text })
  if (-not $wanted.Count) { return $false }
  $readable = $false
  for ($step = 0; $step -lt $Menu.Items.Count + 3; $step++) {
    Send-Tap 0x28
    Start-Sleep -Milliseconds 120
    $now = @(Get-MenuItems $Menu.Handle | Where-Object { $_.Hilite })
    if ($now.Count) {
      $readable = $true
      if ($now[0].Text -eq $Text) {
        $Test.facts.Add("Down pressed $($step + 1) times to reach '$Text'")
        Send-Tap 0x0D
        return $true
      }
    }
  }
  if ($readable) { return $false }
  $Test.facts.Add("the highlighted menu item could not be read, so '$Text' was not chosen")
  Close-Menus
  return $false
}

function Invoke-Json([string]$Path) { return Invoke-RestMethod -Uri "http://127.0.0.1:$($script:Session.Port)$Path" -TimeoutSec 5 -NoProxy }

function Get-Targets {
  $list = Invoke-Json "/json/list"
  return @($list | ForEach-Object { $_ } | Where-Object { $_.type -eq "page" })
}

function Get-Page([string]$PathPattern) {
  try { return Get-Targets | Where-Object { $_.url -match $PathPattern } | Select-Object -First 1 } catch { return $null }
}

function Invoke-Cdp($Page, [string]$Method, [hashtable]$Parameters = @{}, [int]$TimeoutMs = 5000) {
  if (-not $Page -or -not $Page.webSocketDebuggerUrl) { throw "no DevTools page to send $Method to" }
  $devtools = [CdpSession]::new($Page.webSocketDebuggerUrl, 4000)
  try { return ($devtools.Send($Method, ($Parameters | ConvertTo-Json -Compress -Depth 5), $TimeoutMs) | ConvertFrom-Json) } finally { $devtools.Dispose() }
}

function Invoke-Page([string]$PathPattern, [string]$Expression, [int]$TimeoutMs = 5000) {
  $page = Get-Page $PathPattern
  if (-not $page) { throw "no DevTools page matches $PathPattern" }
  $reply = Invoke-Cdp $page "Runtime.evaluate" @{ expression = $Expression; returnByValue = $true } $TimeoutMs
  if ($reply.result.exceptionDetails) { throw "page threw: $($reply.result.exceptionDetails.text)" }
  return $reply.result.result.value
}

function Try-Page([string]$PathPattern, [string]$Expression, [int]$TimeoutMs = 4000) {
  try { return Invoke-Page $PathPattern $Expression $TimeoutMs } catch { return $null }
}

function Get-PathPattern([string]$Path) { return "$([regex]::Escape($Path))(?:[?#]|$)" }

function Read-PageState([string]$Path) {
  $value = Try-Page (Get-PathPattern $Path) "JSON.stringify({state: document.readyState, title: document.title, visibility: document.visibilityState, url: location.href})" 3000
  if (-not $value) { return $null }
  return $value | ConvertFrom-Json
}

function Get-Visibility([string]$Path) {
  $state = Read-PageState $Path
  if ($state) { return $state.visibility }
  return $null
}

function Get-VisiblePaths([string[]]$Paths) { return @($Paths | Where-Object { (Get-Visibility $_) -eq "visible" }) }

function Select-Row([IntPtr]$Window, [string]$Name) {
  $path = $script:RowPaths[$Name]
  Release-Modifiers
  Close-Menus
  Focus-Window $Window | Out-Null
  $row = Find-Row $Window $Name
  $key = $Window.ToInt64()
  $prior = $script:Front[$key]
  $shownElsewhere = $prior -ne $path -and @($script:Front.Values) -contains $path
  if (-not $row -or -not $path -or ($shownElsewhere -and -not $prior)) {
    Note "select '$Name' in $("0x{0:x}" -f $key): row $(if ($row) { 'found' } else { 'not found in the sidebar' }), page path '$path', this window's known front '$prior'"
    return $false
  }
  Send-Click $row.X $row.Y
  $ok = Wait-For {
    if ((Get-Visibility $path) -ne "visible") { return $null }
    if ($shownElsewhere -and (Get-Visibility $prior) -ne "hidden") { return $null }
    $true
  } 15000
  Note "select '$Name' in $("0x{0:x}" -f $key) at $($row.X),$($row.Y) ($($row.Bound)): $path visible $([bool]$ok)$(if ($shownElsewhere) { "; it already showed in another window, so this window's previous page $prior also had to become hidden" })"
  if ($ok) { $script:Front[$key] = $path }
  return [bool]$ok
}

function New-Test([string]$Id, [string]$Title) {
  return [pscustomobject]@{ id = $Id; title = $Title; status = "fail"; checks = [System.Collections.Generic.List[object]]::new(); facts = [System.Collections.Generic.List[string]]::new(); shots = [System.Collections.Generic.List[string]]::new(); seconds = 0 }
}

function Check($Test, [string]$Name, [bool]$Ok) {
  $Test.checks.Add([pscustomobject]@{ name = $Name; ok = $Ok })
  Note "  $(if ($Ok) { 'ok  ' } else { 'FAIL' }) $Name"
}

function Require($Test, [string]$Name, [bool]$Ok) {
  $Test.checks.Add([pscustomobject]@{ name = "precondition: $Name"; ok = $Ok })
  if (-not $Ok) { throw "precondition: $Name" }
}

function Invoke-Test([string]$Id, [string]$Title, [scriptblock]$Body) {
  $test = New-Test $Id $Title
  $script:Tests.Add($test)
  Note "TEST $Id $Title"
  $begin = Get-Date
  if ((Get-Date) -gt $deadline) {
    $test.status = "not-run"
    $test.facts.Add("the run's $BudgetSeconds s budget was used up before this test")
  } elseif (-not (Test-Alive)) {
    $test.status = "not-run"
    $test.facts.Add("the app was no longer running")
  } else {
    try {
      & $Body $test
      $failed = @($test.checks | Where-Object { -not $_.ok }).Count
      $test.status = if ($test.checks.Count -and -not $failed) { "pass" } else { "fail" }
    } catch {
      $message = $_.Exception.Message
      if ($message -like "precondition:*") {
        $test.status = "inconclusive"
        $test.facts.Add("not reached: $message")
      } else {
        $test.status = "fail"
        $test.facts.Add("error: $message")
      }
    }
    Save-Shot $test "$Id-end"
    Release-Modifiers
    if (Test-Alive) { Close-Menus }
    if ($script:Session) { Watch-OwnedTree $script:Session.Tree }
  }
  $test.seconds = [Math]::Round(((Get-Date) - $begin).TotalSeconds, 1)
  Note "  -> $($test.status)"
  Write-Results | Out-Null
}

function Add-Unsupported([string]$Id, [string]$Title, [string]$Reason) {
  $test = New-Test $Id $Title
  $test.status = "unsupported"
  $test.facts.Add($Reason)
  $script:Tests.Add($test)
  Note "UNSUPPORTED $Id $Title`: $Reason"
}

function Write-Results {
  $counts = [ordered]@{}
  foreach ($status in @("pass", "fail", "inconclusive", "not-run", "unsupported")) { $counts[$status] = @($script:Tests | Where-Object { $_.status -eq $status }).Count }
  $verdict = if ($counts["fail"]) { "fail" } elseif ($counts["inconclusive"] -or $counts["not-run"] -or $counts["unsupported"]) { "incomplete" } elseif ($counts["pass"]) { "pass" } else { "incomplete" }
  $document = [ordered]@{ mode = $Mode; verdict = $verdict; counts = $counts; app = $App; seconds = [Math]::Round(((Get-Date) - $started).TotalSeconds, 1); facts = $script:Facts; tests = $script:Tests }
  $document | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $resultsFile -Encoding utf8NoBOM
  $lines = @("# Windows $Mode runtime verification", "", "Verdict: **$verdict** ($(($counts.GetEnumerator() | ForEach-Object { "$($_.Value) $($_.Key)" }) -join ', ')).", "")
  $lines += @($script:Facts | ForEach-Object { "- $_" })
  $lines += @("", "| Test | Status | Checks |", "| --- | --- | --- |")
  foreach ($test in $script:Tests) {
    $checks = @($test.checks | ForEach-Object { "$(if ($_.ok) { 'ok' } else { 'FAIL' }): $($_.name)" }) -join "<br>"
    if (-not $checks) { $checks = ($test.facts -join "<br>") }
    $lines += "| $($test.id): $($test.title) | **$($test.status)** | $($checks -replace '\|', '/') |"
  }
  Set-Content -LiteralPath $summaryFile -Value $lines -Encoding utf8NoBOM
  return $verdict
}

function Start-Server {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  $listener.Start()
  $port = ($listener.LocalEndpoint).Port
  $listener.Stop()
  $common = "<script>window.__loadId=Math.random().toString(36).slice(2);window.__ticks=0;setInterval(()=>window.__ticks++,100)</script><style>html,body{margin:0;height:100%;font:24px sans-serif}</style>"
  $fill = "position:fixed;left:0;top:0;width:100%;height:100%;box-sizing:border-box;font-size:32px"
  $pages = @{
    "/alpha" = "<!doctype html><title>Probe Alpha</title>$common<p>alpha</p>"
    "/bravo" = "<!doctype html><title>Probe Bravo</title>$common<p>bravo</p>"
    "/second" = "<!doctype html><title>Probe Second</title>$common<p>second window</p>"
    "/field" = "<!doctype html><title>Probe Field</title>$common<input id=f autocomplete=off style='$fill'>"
    "/form" = "<!doctype html><title>Probe Form</title>$common<input id=f autocomplete=off style='$fill'>"
    "/audio" = "<!doctype html><title>Probe Audio</title>$common<button id=b style='$fill' onclick=`"if(!window.__ctx){const c=new AudioContext();const o=c.createOscillator();const g=c.createGain();g.gain.value=0.05;o.connect(g).connect(c.destination);o.start();window.__ctx=c}`">play</button>"
    "/progress" = "<!doctype html><title>Progress {n}</title>$common<p>progress {n}</p>"
    "/control-a" = "<!doctype html><title>Seed Control A</title>$common<input id=f autocomplete=off style='$fill'>"
    "/control-b" = "<!doctype html><title>Seed Control B</title>$common<input id=f autocomplete=off style='$fill'>"
    "/outside-a" = "<!doctype html><title>Seed Outside</title>$common<p>outside</p>"
    "/nested-a" = "<!doctype html><title>Seed Nested A</title>$common<p>nested a</p>"
    "/nested-b" = "<!doctype html><title>Seed Nested B</title>$common<p>nested b</p>"
    "/nested-c" = "<!doctype html><title>Seed Nested C</title>$common<p>nested c</p>"
    "/pin" = "<!doctype html><title>Seed Pin</title>$common<p>shared pin</p>"
    "/pip" = '<!doctype html><title>Seed Video</title>' + $common + '<video id=v muted playsinline preload=auto src="data:video/webm;base64,' + $SeedVideo + '" style="position:fixed;left:0;top:0;width:100%;height:100%"></video><button id=b style="position:fixed;left:0;top:0;width:100%;height:100%;background:transparent;border:0;font-size:32px">picture in picture</button><script>window.__pip=null;b.onclick=async()=>{try{if(document.pictureInPictureElement){await document.exitPictureInPicture();window.__pip="closed";return}await v.requestPictureInPicture();v.pause();window.__pip="open"}catch(e){window.__pip="error "+e.name+": "+e.message}}</script>'
  }
  $hits = [hashtable]::Synchronized(@{})
  $http = [System.Net.HttpListener]::new()
  $http.Prefixes.Add("http://127.0.0.1:$port/")
  $http.Start()
  $runner = [powershell]::Create()
  $runner.AddScript({
      param($Listener, $Pages, $Hits)
      while ($Listener.IsListening) {
        try { $context = $Listener.GetContext() } catch { break }
        try {
          $Hits[$context.Request.Url.AbsolutePath] = 1 + [int]$Hits[$context.Request.Url.AbsolutePath]
          $html = $Pages[$context.Request.Url.AbsolutePath]
          if (-not $html) { $html = $Pages["/progress"] }
          $bytes = [System.Text.Encoding]::UTF8.GetBytes($html.Replace("{n}", [string]$context.Request.QueryString["n"]))
          $context.Response.ContentType = "text/html; charset=utf-8"
          $context.Response.Headers.Add("Cache-Control", "no-store")
          $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
          $context.Response.Close()
        } catch { }
      }
    }).AddArgument($http).AddArgument($pages).AddArgument($hits) | Out-Null
  $null = $runner.BeginInvoke()
  $script:Server = [pscustomobject]@{ Listener = $http; Runner = $runner; Base = "http://127.0.0.1:$port"; Hits = $hits }
}

function Stop-Server {
  if (-not $script:Server) { return }
  try { $script:Server.Listener.Stop(); $script:Server.Listener.Close() } catch { }
  try { $script:Server.Runner.Stop(); $script:Server.Runner.Dispose() } catch { }
}

function Start-Recorder {
  $ffmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
  if (-not $ffmpeg) { $script:Facts.Add("no video: ffmpeg is not on PATH; screenshots only"); return }
  $info = [System.Diagnostics.ProcessStartInfo]::new($ffmpeg.Source, "-hide_banner -loglevel error -y -f gdigrab -framerate 8 -i desktop -t $($BudgetSeconds + 60) -vf scale=trunc(iw/2)*2:trunc(ih/2)*2 -c:v libx264 -preset ultrafast -pix_fmt yuv420p `"$(Join-Path $Out "run.mp4")`"")
  $info.UseShellExecute = $false
  $info.RedirectStandardInput = $true
  $info.RedirectStandardError = $true
  $script:Recorder = [System.Diagnostics.Process]::Start($info)
  $script:RecorderTree = New-ProcessTree $script:Recorder "ffmpeg"
  $script:Facts.Add("video: run.mp4 from ffmpeg gdigrab at 8 fps")
}

function Stop-Recorder {
  if (-not $script:Recorder) { return }
  try {
    if (-not $script:Recorder.HasExited) { $script:Recorder.StandardInput.Write("q"); $script:Recorder.StandardInput.Close() }
    if (-not $script:Recorder.WaitForExit(15000)) {
      Stop-OwnTree $script:RecorderTree -ChildrenOnly:$script:Recorder.HasExited
      $script:Facts.Add("recorder cleanup: $(Format-TreeReport $script:RecorderTree)")
    }
  } catch { $script:Facts.Add("recorder cleanup error: $($_.Exception.Message)") }
}

function Get-UtcStart($Process) {
  try { return $Process.StartTime.ToUniversalTime() } catch { return $null }
}

function Format-Start($Value) {
  if ($null -eq $Value) { return "unknown" }
  return $Value.ToString("o")
}

function Test-SameStart($First, $Second) {
  return $null -ne $First -and $null -ne $Second -and [Math]::Abs(($First - $Second).TotalMilliseconds) -lt 1
}

function New-ProcessTree($Process, [string]$Name) {
  $null = $Process.Handle
  return [pscustomobject]@{ Name = $Name; Root = $Process; Id = $Process.Id; Started = (Get-UtcStart $Process); RootConfirmed = $false; Owned = @{}; Stopped = [System.Collections.Generic.List[string]]::new(); Refused = [System.Collections.Generic.List[string]]::new() }
}

function Open-Pinned([int]$Id, $Started) {
  if ($null -eq $Started) { return $null }
  try { $process = [System.Diagnostics.Process]::GetProcessById($Id); $null = $process.Handle } catch { return $null }
  if (Test-SameStart (Get-UtcStart $process) $Started) { return $process }
  $process.Dispose()
  return $null
}

function Test-RootPinned($Tree) {
  return $null -ne $Tree.Started -and (Test-SameStart (Get-UtcStart $Tree.Root) $Tree.Started)
}

function Update-OwnedTree($Tree) {
  if (-not $Tree) { return @() }
  try {
    $rows = @(Get-CimInstance Win32_Process | ForEach-Object { [pscustomobject]@{ ProcessId = [int]$_.ProcessId; ParentProcessId = [int]$_.ParentProcessId; CreationDate = $(if ($_.CreationDate) { $_.CreationDate.ToUniversalTime() } else { $null }) } })
  } catch {
    $Tree.Refused.Add("process list unavailable: $($_.Exception.Message)")
    return @()
  }
  $live = @{}
  foreach ($row in $rows) { $live[$row.ProcessId] = $row }
  $seeds = @{}
  $Tree.RootConfirmed = $false
  $rootListedAs = if ($live.ContainsKey($Tree.Id)) { $live[$Tree.Id].CreationDate } else { $null }
  if ((Test-RootPinned $Tree) -and (-not $live.ContainsKey($Tree.Id) -or (Test-SameStart $rootListedAs $Tree.Started))) { $seeds[$Tree.Id] = $Tree.Started; $Tree.RootConfirmed = $true }
  else {
    $reason = "root $($Tree.Id) identity: started $(Format-Start $Tree.Started), handle $(Format-Start (Get-UtcStart $Tree.Root)), listed $(if ($live.ContainsKey($Tree.Id)) { Format-Start $rootListedAs } else { 'absent' })"
    if (-not $Tree.Refused.Contains($reason)) { $Tree.Refused.Add($reason) }
  }
  foreach ($owned in @($Tree.Owned.Values)) {
    $listed = $live.ContainsKey($owned.Id)
    if ((Test-SameStart (Get-UtcStart $owned.Process) $owned.Started) -and (-not $listed -or (Test-SameStart $live[$owned.Id].CreationDate $owned.Started))) { $seeds[$owned.Id] = $owned.Started }
  }
  $running = [System.Collections.Generic.List[object]]::new()
  foreach ($row in $rows) {
    if ($seeds.ContainsKey($row.ProcessId)) { continue }
    $running.Add($row)
  }
  foreach ($seed in $seeds.GetEnumerator()) { $running.Add([pscustomobject]@{ ProcessId = [int]$seed.Key; ParentProcessId = -1; CreationDate = $seed.Value }) }
  $order = [System.Collections.Generic.List[int]]::new()
  foreach ($seed in @($seeds.Keys)) {
    foreach ($member in (Get-StopOrder $seed $running.ToArray())) {
      if ($order.Contains($member)) { continue }
      $order.Add($member)
      if ($member -eq $Tree.Id -or $Tree.Owned.ContainsKey($member) -or -not $live.ContainsKey($member)) { continue }
      $pinned = Open-Pinned $member $live[$member].CreationDate
      if ($pinned) { $Tree.Owned[$member] = [pscustomobject]@{ Id = $member; Started = $live[$member].CreationDate; Process = $pinned } }
      else {
        $reason = "child $member identity unconfirmed (listed start $(Format-Start $live[$member].CreationDate))"
        if (-not $Tree.Refused.Contains($reason)) { $Tree.Refused.Add($reason) }
      }
    }
  }
  return $order.ToArray()
}

function Watch-OwnedTree($Tree) {
  try { Update-OwnedTree $Tree | Out-Null } catch { $script:Facts.Add("process tree observation failed: $($_.Exception.Message)") }
}

function Stop-Pinned($Tree, $Process, $Started, [int]$Id) {
  try {
    if ($Process.HasExited) { return }
    if (-not (Test-SameStart (Get-UtcStart $Process) $Started)) { $Tree.Refused.Add("kill $Id identity"); return }
    $Process.Kill()
    $Tree.Stopped.Add([string]$Id)
  } catch { $Tree.Refused.Add("kill ${Id}: $($_.Exception.Message)") }
}

function Stop-OwnTree($Tree, [switch]$ChildrenOnly) {
  if (-not $Tree) { return }
  $order = @(Update-OwnedTree $Tree)
  foreach ($member in $order) {
    if ($member -eq $Tree.Id -or -not $Tree.Owned.ContainsKey($member)) { continue }
    $owned = $Tree.Owned[$member]
    Stop-Pinned $Tree $owned.Process $owned.Started $member
  }
  foreach ($owned in @($Tree.Owned.Values)) {
    if ($order -notcontains $owned.Id) { Stop-Pinned $Tree $owned.Process $owned.Started $owned.Id }
  }
  if (-not $ChildrenOnly) {
    if ($Tree.RootConfirmed) { Stop-Pinned $Tree $Tree.Root $Tree.Started $Tree.Id }
    elseif (-not $Tree.Root.HasExited) { $Tree.Refused.Add("root $($Tree.Id) not stopped: identity unconfirmed") }
  }
}

function Format-TreeReport($Tree) {
  if (-not $Tree) { return "no process tree" }
  $alive = @($Tree.Owned.Values | Where-Object { try { -not $_.Process.HasExited } catch { $false } }).Count
  return "$($Tree.Name) tree: $($Tree.Owned.Count) descendants observed, stopped [$($Tree.Stopped -join ', ')], still running $alive, refused [$($Tree.Refused -join '; ')]"
}

function Start-Ardia([string]$SessionJson) {
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $dataRoot
  $config = Join-Path $dataRoot "config"
  New-Item -ItemType Directory -Force -Path $config | Out-Null
  Set-Content -LiteralPath (Join-Path $dataRoot "onboarding.json") -Value '{"completedAt":1700000000000,"version":1}' -Encoding utf8NoBOM
  if ($SessionJson) {
    [System.IO.File]::WriteAllText((Join-Path $dataRoot "session.json"), $SessionJson, [System.Text.UTF8Encoding]::new($false))
    $script:Facts.Add("seeded session.json ($($SessionJson.Length) chars) written before launch")
  }
  Set-Content -LiteralPath (Join-Path $dataRoot "perf-probe") -Value "on" -Encoding utf8NoBOM
  $settings = @{ settings = @{ openLinksInLittleArdia = $false; warnBeforeClosingWindow = $false; warnBeforeQuitting = $false; shortcuts = @{ "tabSwitcher:forward" = "ctrl+tab"; nextTab = "" } } }
  Set-Content -LiteralPath (Join-Path $config "config.json") -Value ($settings | ConvertTo-Json -Depth 6) -Encoding utf8NoBOM
  New-Item -ItemType File -Force -Path (Join-Path (Split-Path -Parent $App) "Ardia.test-build") | Out-Null
  $port = Get-Random -Minimum 20000 -Maximum 40000
  Remove-Item Env:ARDIA_BACKGROUND -ErrorAction SilentlyContinue
  Remove-Item Env:ARDIA_TEST -ErrorAction SilentlyContinue
  $env:ARDIA_DATA_DIR = $dataRoot
  $env:ARDIA_CONFIG_DIR = $config
  $env:ARDIA_REMOTE_DEBUGGING_PORT = "$port"
  $process = Start-Process -FilePath $App -ArgumentList "--log-file=`"$appLog`"" -PassThru
  $tree = New-ProcessTree $process "Ardia"
  $env:ARDIA_REMOTE_DEBUGGING_PORT = ""
  $script:Session = [pscustomobject]@{ Process = $process; Port = $port; Main = [IntPtr]::Zero; Second = [IntPtr]::Zero; Tree = $tree }
  if ($null -eq $tree.Started) { $script:Facts.Add("the app's start time could not be read, so cleanup will refuse to stop its processes") }
  $script:Facts.Add("launched $App as pid $($process.Id) with ARDIA_DATA_DIR=$dataRoot, ARDIA_BACKGROUND and ARDIA_TEST unset, test-build marker beside the app, DevTools port $port")
  $main = Wait-For { if ((Read-AppLog | Where-Object { $_ -match "\[ardia windows\] first window" }).Count) { @(Get-AppWindows) | Select-Object -First 1 } } 60000
  if (-not $main) { throw "no first window within 60 s" }
  $script:Session.Main = $main.Handle
  $gate = @(Read-AppLog | Where-Object { $_ -match "test gate" } | Select-Object -First 2)
  if ($gate.Count) { $script:Facts.Add("test gate: $($gate -join ' / ')") }
  $devtools = Wait-For { try { Invoke-Json "/json/version" } catch { $null } } 30000
  if (-not $devtools) { throw "DevTools did not answer on port $port, so the engine or the test instance is missing" }
  $script:Facts.Add("engine: $($devtools.Browser)")
  Watch-OwnedTree $script:Session.Tree
  $area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
  $width = [Math]::Min(1100, $area.Width - 200)
  $script:Session | Add-Member -NotePropertyName Area -NotePropertyValue $area
  [MenuProbe]::ShowWindow($main.Handle, 9) | Out-Null
  [MenuProbe]::SetWindowPos($main.Handle, [IntPtr]::Zero, $area.Left, $area.Top, $width, $area.Height - 10, 0x0040) | Out-Null
  Start-Sleep -Milliseconds 1500
  $script:Facts.Add("screen work area $($area.Width)x$($area.Height); main window placed at $($area.Left),$($area.Top) size ${width}x$($area.Height - 10)")
  $harness = Test-Harness
  $script:HarnessReady = $harness
  $script:Facts.Add("JS dev harness (perf-probe dev-eval): $(if ($harness) { 'answers' } else { 'did not answer in 6 s; checks use the log, window titles, UI Automation and DevTools only' })")
}

function Test-Harness {
  $script:HarnessId = 0
  return (Invoke-Harness "return 1 + 1" 6000) -eq 2
}

function Invoke-Harness([string]$Source, [int]$TimeoutMs = 4000) {
  $script:HarnessId++
  $id = "probe$PID-$($script:HarnessId)"
  $result = Join-Path $dataRoot "dev-eval-result.json"
  Set-Content -LiteralPath (Join-Path $dataRoot "dev-eval.js") -Value "// $id`n$Source" -Encoding utf8NoBOM
  $answer = Wait-For {
    try { $parsed = Get-Content -LiteralPath $result -Raw -ErrorAction Stop | ConvertFrom-Json; if ($parsed.id -eq $id) { $parsed } } catch { $null }
  } $TimeoutMs
  if (-not $answer -or $answer.PSObject.Properties.Name -contains "error") { return $null }
  return $answer.result
}

function Get-HarnessSwitcher {
  if (-not $script:HarnessReady) { return "harness unavailable" }
  $value = Invoke-Harness "return JSON.stringify(ac.sidebarRows.sidebarUi().switcher)"
  if ($null -eq $value) { return "harness gave no answer" }
  return $value
}

function Open-Tab([IntPtr]$Window, [string]$Path, [string]$Title) {
  Focus-Window $Window | Out-Null
  $mark = Get-LogMark
  Send-Chord @(0x11) 0x54
  $opened = Wait-For { (Get-LinesSince $mark '^command \d+ newTab$').Count } 3000
  Start-Sleep -Milliseconds 700
  [MenuProbe]::TypeText("$($script:Server.Base)$Path")
  Start-Sleep -Milliseconds 400
  Send-Tap 0x0D
  $state = Wait-For { $now = Read-PageState $Path; if ($now -and $now.state -eq "complete" -and $now.title -eq $Title -and $now.visibility -eq "visible") { $now } } 20000
  $row = if ($state) { Find-Row $Window $Title } else { $null }
  $last = if ($state) { $state } else { Read-PageState $Path }
  Note "opened $Path in $("0x{0:x}" -f $Window.ToInt64()): newTab $([bool]$opened), page $(if ($last) { $last | ConvertTo-Json -Compress } else { 'not listed' }), sidebar row '$Title' $(if ($row) { "at $($row.X),$($row.Y) ($($row.Bound))" } else { 'not found' }), window title '$([MenuProbe]::TitleOf($Window))'"
  if ($state -and $row) { $script:Front[$Window.ToInt64()] = $Path }
  return [bool]$state -and [bool]$row
}

function Get-MainTitle { return [MenuProbe]::TitleOf($script:Session.Main) }

function Get-RowName([string]$Path) { return @($script:RowPaths.GetEnumerator() | Where-Object { $_.Value -eq $Path } | ForEach-Object { $_.Key }) | Select-Object -First 1 }

function Invoke-MenuMode {
  $main = $script:Session.Main
  $setup = (Open-Tab $main "/alpha" "Probe Alpha") -and (Open-Tab $main "/bravo" "Probe Bravo") -and (Open-Tab $main "/field" "Probe Field")
  $script:Facts.Add("three local pages opened as tabs (Alpha, Bravo, Field), each loaded with its title, reporting visibilityState visible and shown as a row in the main window's sidebar: $setup")
  $mainPaths = @("/alpha", "/bravo", "/progress", "/field")

  Invoke-Test "escape" "A production menu opens on a right-clicked sidebar tab and Escape dismisses it without a choice" {
    param($t)
    Require $t "three tabs opened" $setup
    Set-Clipboard -Value "menu-probe-sentinel"
    $pages = @(Get-Targets).Count
    $menu = Open-Menu $t $main "Probe Alpha"
    Require $t "the native menu opened (#32768 window and 'pop-up menu shown')" ([bool]$menu)
    $shown = @(Get-LinesSince $menu.Mark '^menu \d+ pop-up menu shown')[0]
    Check $t "the menu was tracked natively, not answered by a background or test override" ($shown -and (Get-LinesSince $menu.Mark 'not shown in a background instance|appMenu').Count -eq 0)
    Check $t "the menu thread took the foreground" (Test-ForegroundOurs)
    Save-Shot $t "escape-open"
    Send-Tap 0x1B
    Check $t "Escape closed the menu" (Wait-MenuClosed $menu)
    Check $t "the menu resolved as dismissed" ((Get-MenuOutcome $menu) -match "dismissed")
    Check $t "nothing was chosen: the clipboard is unchanged" ((Get-Clipboard -Raw) -eq "menu-probe-sentinel")
    Check $t "nothing was chosen: the page count is unchanged" (@(Get-Targets).Count -eq $pages)
  }

  Invoke-Test "page-focus" "Typing in a focused page field continues after a menu is opened and dismissed" {
    param($t)
    Require $t "three tabs opened" $setup
    Require $t "the Field tab is in front (its page reports visibilityState visible)" ((Get-Visibility "/field") -eq "visible")
    Focus-Window $main | Out-Null
    $point = Get-PagePoint $main
    Send-Click $point.X $point.Y
    [MenuProbe]::TypeText("ab")
    Start-Sleep -Milliseconds 400
    $before = Try-Page "/field" "document.getElementById('f').value"
    Require $t "the page field took the typed 'ab' (it was '$before')" ($before -eq "ab")
    $menu = Open-Menu $t $main "Probe Alpha" -KeepModifiers
    Require $t "the native menu opened" ([bool]$menu)
    Send-Tap 0x1B
    Check $t "Escape closed the menu" (Wait-MenuClosed $menu)
    Start-Sleep -Milliseconds 300
    $t.facts.Add("foreground after dismissal: $(Describe-Foreground)")
    [MenuProbe]::TypeText("cd")
    Start-Sleep -Milliseconds 500
    $state = Try-Page "/field" "JSON.stringify({value: document.getElementById('f').value, focused: document.hasFocus(), active: document.activeElement && document.activeElement.id})"
    $t.facts.Add("page state after typing again: $state")
    $parsed = if ($state) { $state | ConvertFrom-Json } else { $null }
    Check $t "keys typed after the menu reached the same field: value is 'abcd'" ($parsed -and $parsed.value -eq "abcd")
    Check $t "the page document has focus again" ($parsed -and $parsed.focused)
    Check $t "the field is still the active element" ($parsed -and $parsed.active -eq "f")
  }

  Invoke-Test "page-focus-long-press" "Holding right-click for 2.2 seconds before opening and dismissing a menu still returns typing to the page" {
    param($t)
    Require $t "three tabs opened" $setup
    Require $t "the Field tab is in front (its page reports visibilityState visible)" ((Get-Visibility "/field") -eq "visible")
    Try-Page "/field" "document.getElementById('f').value = ''" | Out-Null
    Focus-Window $main | Out-Null
    $point = Get-PagePoint $main
    Send-Click $point.X $point.Y
    [MenuProbe]::TypeText("ab")
    Start-Sleep -Milliseconds 400
    $before = Try-Page "/field" "document.getElementById('f').value"
    Require $t "the page field took the typed 'ab' (it was '$before')" ($before -eq "ab")
    $menu = Open-Menu $t $main "Probe Alpha" -KeepModifiers -HoldMs 2200
    Require $t "the native menu opened" ([bool]$menu)
    Send-Tap 0x1B
    Check $t "Escape closed the menu" (Wait-MenuClosed $menu)
    Start-Sleep -Milliseconds 300
    $t.facts.Add("foreground after dismissal: $(Describe-Foreground)")
    [MenuProbe]::TypeText("cd")
    Start-Sleep -Milliseconds 500
    $state = Try-Page "/field" "JSON.stringify({value: document.getElementById('f').value, focused: document.hasFocus(), active: document.activeElement && document.activeElement.id})"
    $t.facts.Add("page state after typing again: $state")
    $parsed = if ($state) { $state | ConvertFrom-Json } else { $null }
    Check $t "keys typed after the menu reached the same field: value is 'abcd'" ($parsed -and $parsed.value -eq "abcd")
    Check $t "the page document has focus again" ($parsed -and $parsed.focused)
    Check $t "the field is still the active element" ($parsed -and $parsed.active -eq "f")
  }

  Invoke-Test "progress" "Pages load, navigate and reload while a menu stays open" {
    param($t)
    Require $t "three tabs opened" $setup
    $menu = Open-Menu $t $main "Probe Alpha"
    Require $t "the native menu opened" ([bool]$menu)
    $ticks = Try-Page "/field" "window.__ticks"
    $loadId = Try-Page "/field" "window.__loadId"
    $target = "$($script:Server.Base)/progress?n=$PID"
    $navigated = $false
    $reloaded = $false
    $navigateMs = $null
    try {
      $clock = [System.Diagnostics.Stopwatch]::StartNew()
      Invoke-Cdp (Get-Page "/bravo") "Page.navigate" @{ url = $target } 8000 | Out-Null
      $navigated = [bool](Wait-For { (Try-Page "/progress" "document.readyState + ' ' + location.href" 2000) -eq "complete $target" } 8000)
      $navigateMs = $clock.ElapsedMilliseconds
      Invoke-Cdp (Get-Page "/field") "Page.reload" @{} 8000 | Out-Null
      $reloaded = [bool](Wait-For { $now = Try-Page "/field" "document.readyState + ' ' + window.__loadId" 2000; $now -and $now -like "complete *" -and $now -ne "complete $loadId" } 8000)
    } catch { $t.facts.Add("DevTools call failed while the menu was open: $($_.Exception.Message)") }
    $stillOpen = @(Get-MenuWindows).Count -gt 0 -and -not (Get-LinesSince $menu.Mark '^menu \d+ pop-up menu (dismissed|chose|failed)').Count
    Save-Shot $t "progress-menu-open"
    $ticksAfter = Try-Page "/field" "window.__ticks"
    $t.facts.Add("hidden tab navigated in $navigateMs ms; visible page ticks $ticks before, $ticksAfter after its reload")
    Require $t "the menu stayed open through the page checks" $stillOpen
    Check $t "a hidden tab navigated to a new page and finished loading while the menu was open" $navigated
    Check $t "the visible page reloaded and finished loading while the menu was open" $reloaded
    Send-Tap 0x1B
    Check $t "Escape then closed the menu" (Wait-MenuClosed $menu)
  }

  Invoke-Test "down-enter" "Down and Enter in the menu choose 'Copy Link', which copies that tab's address" {
    param($t)
    Require $t "three tabs opened" $setup
    Set-Clipboard -Value "menu-probe-sentinel"
    $menu = Open-Menu $t $main "Progress $PID"
    Require $t "the native menu opened" ([bool]$menu)
    $chosen = Select-MenuItem $t $menu "Copy Link"
    Require $t "'Copy Link' was highlighted with Down and Enter was pressed" $chosen
    Check $t "the menu closed" (Wait-MenuClosed $menu)
    Check $t "the menu resolved with the 'copy' choice" ((Get-MenuOutcome $menu) -match "chose copy$")
    $expected = "$($script:Server.Base)/progress?n=$PID"
    $copied = Wait-For { $now = Get-Clipboard -Raw; if ($now -eq $expected) { $now } } 3000
    $t.facts.Add("clipboard: '$(Get-Clipboard -Raw)'")
    Check $t "the clipboard holds the right-clicked tab's address" ([bool]$copied)
  }

  Invoke-Test "outside-page" "A click on the page outside the menu dismisses it without a choice" {
    param($t)
    Require $t "three tabs opened" $setup
    $menu = Open-Menu $t $main "Probe Alpha"
    Require $t "the native menu opened" ([bool]$menu)
    $point = Get-PagePoint $main
    Send-Click $point.X $point.Y
    Check $t "the menu closed" (Wait-MenuClosed $menu)
    Check $t "the menu resolved as dismissed" ((Get-MenuOutcome $menu) -match "dismissed")
    Check $t "the app still answers DevTools" ((Try-Page "/field" "1 + 1") -eq 2)
  }

  Invoke-Test "outside-desktop" "A click on the desktop outside Ardia dismisses the menu" {
    param($t)
    Require $t "three tabs opened" $setup
    $frame = New-Object MenuProbe+Rect
    [MenuProbe]::GetWindowRect($main, [ref]$frame) | Out-Null
    $area = $script:Session.Area
    Require $t "the screen has desktop to the right of the window ($($area.Right - $frame.Right) px)" (($area.Right - $frame.Right) -ge 60)
    $menu = Open-Menu $t $main "Probe Alpha"
    Require $t "the native menu opened" ([bool]$menu)
    Send-Click ([int](($frame.Right + $area.Right) / 2)) ([int]($area.Top + $area.Height / 2))
    Check $t "the menu closed" (Wait-MenuClosed $menu)
    Check $t "the menu resolved as dismissed" ((Get-MenuOutcome $menu) -match "dismissed")
    $t.facts.Add("foreground after the desktop click: $(Describe-Foreground)")
    Check $t "the app still answers DevTools" ((Try-Page "/field" "1 + 1") -eq 2)
  }

  Invoke-Test "dialog" "A page dialog asked for while a menu is open: both open and close, and the app keeps answering" {
    param($t)
    Require $t "three tabs opened" $setup
    $menu = Open-Menu $t $main "Probe Alpha"
    Require $t "the native menu opened" ([bool]$menu)
    $page = Get-Page "/field"
    $devtools = [CdpSession]::new($page.webSocketDebuggerUrl, 4000)
    try {
      $devtools.Send("Page.enable", "{}", 5000) | Out-Null
      $devtools.Send("Runtime.evaluate", '{"expression":"setTimeout(() => { window.__alerted = alert(\"menu probe\") }, 0); 1"}', 5000) | Out-Null
      $opening = $devtools.WaitEvent("Page.javascriptDialogOpening", 6000)
      $openingEvent = if ($opening) { $opening | ConvertFrom-Json } else { $null }
      $dialogVisible = Wait-For { Find-VisibleText "menu probe" } 3000
      $t.facts.Add("browser dialog handler present: $($openingEvent.params.hasBrowserHandler); visible dialog text: $($dialogVisible | ConvertTo-Json -Compress)")
      $menuWindowOpen = @(Get-MenuWindows | Where-Object { $_.Handle -eq $menu.Handle }).Count -gt 0
      $completed = @(Get-LinesSince $menu.Mark '^menu \d+ pop-up menu (dismissed|chose|failed)')
      $t.facts.Add("page dialog opening event: $([bool]$opening); this menu's window $($menu.Handle) still open then: $menuWindowOpen; menu results since it opened: $(if ($completed.Count) { $completed -join ' / ' } else { 'none' }); windows: $((Get-OurWindows | ForEach-Object { $_.ClassName }) -join ', ')")
      Save-Shot $t "dialog-and-menu"
      Check $t "the page dialog had a browser handler and its text was visible" ([bool]$opening -and $openingEvent.params.hasBrowserHandler -eq $true -and [bool]$dialogVisible)
      Check $t "when the dialog was visible, this menu's window still existed and the menu had no result yet" ([bool]$dialogVisible -and $menuWindowOpen -and $completed.Count -eq 0)
      Send-Tap 0x1B
      Check $t "the menu closed" (Wait-MenuClosed $menu 4000)
      $closed = $devtools.WaitEvent("Page.javascriptDialogClosed", 500)
      if (-not $closed) {
        try { $devtools.Send("Page.handleJavaScriptDialog", '{"accept":true}', 5000) | Out-Null } catch { $t.facts.Add("handleJavaScriptDialog: $($_.Exception.Message)") }
        $closed = $devtools.WaitEvent("Page.javascriptDialogClosed", 4000)
      }
      Check $t "the page dialog closed" ([bool]$closed)
    } finally { $devtools.Dispose() }
    Check $t "the page answers DevTools afterwards" ((Try-Page "/field" "1 + 1") -eq 2)
    $again = Open-Menu $t $main "Probe Alpha"
    Check $t "a new menu opens afterwards" ([bool]$again)
    if ($again) { Send-Tap 0x1B; Check $t "and Escape closes it" (Wait-MenuClosed $again) }
  }

  Invoke-Test "switcher-control" "Control: Ctrl+Tab opens the tab switcher and releasing Ctrl commits it" {
    param($t)
    Require $t "three tabs opened" $setup
    Release-Modifiers
    Focus-Window $main | Out-Null
    $before = @(Get-VisiblePaths $mainPaths)
    $beforeTitle = Get-MainTitle
    $mark = Get-LogMark
    Send-Key 0x11 0
    Start-Sleep -Milliseconds 80
    Send-Tap 0x09
    Start-Sleep -Milliseconds 600
    $opened = (Get-LinesSince $mark '^command \d+ tabSwitcher$').Count -gt 0 -and (Get-LinesSince $mark '^keys \d+ switcher capture on$').Count -gt 0
    Save-Shot $t "switcher-open"
    $openMark = Get-LogMark
    Send-Key 0x11 2
    Require $t "Ctrl+Tab opened the switcher ('command tabSwitcher' and 'switcher capture on')" $opened
    $off = Wait-For { (Get-LinesSince $openMark '^keys \d+ switcher capture off$').Count } 2500
    $after = Wait-For { $now = @(Get-VisiblePaths $mainPaths); if ($now.Count -eq 1 -and $before -notcontains $now[0]) { $now[0] } } 3000
    $t.facts.Add("visible probe page '$($before -join ',')' -> '$((Get-VisiblePaths $mainPaths) -join ',')'; window title '$beforeTitle' -> '$(Get-MainTitle)'; harness switcher: $(Get-HarnessSwitcher)")
    Check $t "releasing Ctrl ended the switcher ('switcher capture off')" ([bool]$off)
    Check $t "releasing Ctrl committed another tab (a different probe page became the one visible page)" ([bool]$after)
  }

  Invoke-Test "switcher-menu" "Ctrl held after Ctrl+Tab, right-click a sidebar tab, release Ctrl in the native menu, dismiss: the switcher commits and closes" {
    param($t)
    Require $t "three tabs opened" $setup
    Release-Modifiers
    Focus-Window $main | Out-Null
    $before = @(Get-VisiblePaths $mainPaths)
    $beforeTitle = Get-MainTitle
    $mark = Get-LogMark
    Send-Key 0x11 0
    Start-Sleep -Milliseconds 80
    Send-Tap 0x09
    Start-Sleep -Milliseconds 600
    $opened = (Get-LinesSince $mark '^command \d+ tabSwitcher$').Count -gt 0 -and (Get-LinesSince $mark '^keys \d+ switcher capture on$').Count -gt 0
    Require $t "Ctrl+Tab opened the switcher" $opened
    $row = if ($before -contains "/alpha") { "Probe Field" } else { "Probe Alpha" }
    $menu = Open-Menu $t $main $row -KeepModifiers
    Require $t "with Ctrl still held, the right-click opened the native menu" ([bool]$menu)
    Save-Shot $t "switcher-menu-open"
    $releaseMark = Get-LogMark
    Send-Key 0x11 2
    Start-Sleep -Milliseconds 600
    $t.facts.Add("Ctrl released with the menu open; switcher lines since: $((Get-LinesSince $releaseMark 'switcher') -join ' / '); foreground $(Describe-Foreground)")
    $releaseLogMark = $releaseMark
    Save-Shot $t "switcher-ctrl-released"
    Send-Tap 0x1B
    Check $t "Escape closed the menu" (Wait-MenuClosed $menu)
    $off = Wait-For { (Get-LinesSince $releaseMark '^keys \d+ switcher capture off$').Count } 3000
    $after = Wait-For { $now = @(Get-VisiblePaths $mainPaths); if ($now.Count -eq 1 -and $before -notcontains $now[0]) { $now[0] } } 2500
    $harness = Get-HarnessSwitcher
    $t.facts.Add("visible probe page '$($before -join ',')' -> '$((Get-VisiblePaths $mainPaths) -join ',')'; window title '$beforeTitle' -> '$(Get-MainTitle)'; harness switcher after dismissal: $harness; key lines since the release: $((Get-LinesSince $releaseLogMark '^keys ') -join ' / ')")
    Save-Shot $t "switcher-after-dismiss"
    Check $t "the switcher ended after Ctrl was released in the menu ('switcher capture off')" ([bool]$off)
    Check $t "the switcher committed a tab (a different probe page became the one visible page)" ([bool]$after)
    if ($harness -notmatch "unavailable|no answer") { Check $t "the JS switcher state is null" ($harness -eq "null") }
    if (-not $off) {
      $cleanup = Get-LogMark
      Send-Tap 0x11
      $t.facts.Add("a later Ctrl tap ended it: $([bool](Wait-For { (Get-LinesSince $cleanup '^keys \d+ switcher capture off$').Count } 2000)); visible probe page now '$((Get-VisiblePaths $mainPaths) -join ',')'")
      if (-not (Get-LinesSince $cleanup '^keys \d+ switcher capture off$').Count) { Send-Tap 0x1B }
    }
  }

  Invoke-Test "switcher-menu-held" "Control: Ctrl held after Ctrl+Tab, right-click a sidebar tab, choose Copy Link with Ctrl still held: the switcher stays open until Ctrl is physically let go, then commits" {
    param($t)
    Require $t "three tabs opened" $setup
    Release-Modifiers
    Focus-Window $main | Out-Null
    $before = @(Get-VisiblePaths $mainPaths)
    $mark = Get-LogMark
    Send-Key 0x11 0
    Start-Sleep -Milliseconds 80
    Send-Tap 0x09
    Start-Sleep -Milliseconds 600
    $opened = (Get-LinesSince $mark '^command \d+ tabSwitcher$').Count -gt 0 -and (Get-LinesSince $mark '^keys \d+ switcher capture on$').Count -gt 0
    Require $t "Ctrl+Tab opened the switcher" $opened
    $row = if ($before -contains "/alpha") { "Probe Field" } else { "Probe Alpha" }
    $menu = Open-Menu $t $main $row -KeepModifiers
    Require $t "with Ctrl still held, the right-click opened the native menu" ([bool]$menu)
    Save-Shot $t "switcher-held-menu-open"
    $dismissMark = Get-LogMark
    Set-Clipboard -Value "held-menu-copy-sentinel"
    Require $t "Copy Link was chosen with Down and Enter while Ctrl stayed held" (Select-MenuItem $t $menu "Copy Link")
    Check $t "choosing Copy Link closed the menu while Ctrl stayed held" (Wait-MenuClosed $menu)
    Check $t "the menu resolved with the copy choice" ((Get-MenuOutcome $menu) -match "chose copy$")
    $copiedPath = if ($row -eq "Probe Alpha") { "/alpha" } else { "/field" }
    $expectedCopy = "$($script:Server.Base)$copiedPath"
    Check $t "Copy Link copied the right-clicked page" ([bool](Wait-For { if ((Get-Clipboard -Raw) -eq $expectedCopy) { $true } } 3000))
    Require $t "Ctrl is still physically held after the menu closed" (([MenuProbe]::GetAsyncKeyState(0x11) -band 0x8000) -ne 0)
    $t.facts.Add("foreground after Copy Link with Ctrl held: $(Describe-Foreground)")
    Require $t "the foreground stayed in Ardia after choosing Copy Link with Ctrl held" (Test-ForegroundOurs)
    Start-Sleep -Milliseconds 1200
    $heldLines = @(Get-LinesSince $dismissMark '^keys ')
    $heldFront = @(Get-VisiblePaths $mainPaths)
    $t.facts.Add("while Ctrl stayed held after the menu: key lines $(if ($heldLines.Count) { $heldLines -join ' / ' } else { 'none' }); visible probe page '$($before -join ',')' -> '$($heldFront -join ',')'; harness switcher: $(Get-HarnessSwitcher)")
    Save-Shot $t "switcher-held-after-menu"
    Check $t "with Ctrl still held after the menu closed, the switcher stayed open (no 'switcher capture off')" (-not @($heldLines | Where-Object { $_ -match 'switcher capture off$' }).Count)
    Check $t "with Ctrl still held, the menu's return did not report a release ('switcher modifier let go while a menu was open')" (-not @($heldLines | Where-Object { $_ -match 'switcher modifier let go while a menu was open' }).Count)
    Check $t "with Ctrl still held, no tab was committed (the visible probe page is unchanged)" (($heldFront -join ',') -eq ($before -join ','))
    $releaseMark = Get-LogMark
    Send-Key 0x11 2
    $off = Wait-For { (Get-LinesSince $releaseMark '^keys \d+ switcher capture off$').Count } 2500
    $after = Wait-For { $now = @(Get-VisiblePaths $mainPaths); if ($now.Count -eq 1 -and $before -notcontains $now[0]) { $now[0] } } 3000
    $t.facts.Add("after the physical Ctrl release: key lines $((Get-LinesSince $releaseMark '^keys ') -join ' / '); visible probe page '$((Get-VisiblePaths $mainPaths) -join ',')'; harness switcher: $(Get-HarnessSwitcher)")
    Save-Shot $t "switcher-held-released"
    Check $t "the later physical Ctrl release ended the switcher ('switcher capture off')" ([bool]$off)
    Check $t "the later physical Ctrl release committed another tab (a different probe page became the one visible page)" ([bool]$after)
    if (-not $off) {
      Send-Tap 0x1B
      $t.facts.Add("Escape after the release ended it: $([bool](Wait-For { (Get-LinesSince $releaseMark '^keys \d+ switcher capture off$').Count } 2000))")
    }
  }

  Invoke-Test "outside-window" "A click in another Ardia window dismisses the menu" {
    param($t)
    Require $t "three tabs opened" $setup
    $known = @(Get-AppWindows | ForEach-Object { $_.Handle.ToInt64() })
    Focus-Window $main | Out-Null
    Send-Chord @(0x11) 0x4E
    $new = Wait-For { @(Get-AppWindows | Where-Object { $known -notcontains $_.Handle.ToInt64() }) | Select-Object -First 1 } 8000
    Require $t "Ctrl+N opened a second window" ([bool]$new)
    $script:Session.Second = $new.Handle
    $area = $script:Session.Area
    $frame = New-Object MenuProbe+Rect
    [MenuProbe]::GetWindowRect($main, [ref]$frame) | Out-Null
    $left = $area.Left + [int](($frame.Right - $frame.Left) * 0.45)
    $top = $area.Top + [int]($area.Height * 0.3)
    [MenuProbe]::SetWindowPos($new.Handle, [IntPtr]::Zero, $left, $top, $area.Right - $left, $area.Bottom - $top, 0x0040) | Out-Null
    Start-Sleep -Milliseconds 800
    Require $t "the second window shows a page" (Open-Tab $new.Handle "/second" "Probe Second")
    $menu = Open-Menu $t $main "Probe Alpha"
    Require $t "the native menu opened in the first window" ([bool]$menu)
    $point = Get-PagePoint $new.Handle
    Send-Click $point.X $point.Y
    Check $t "the menu closed" (Wait-MenuClosed $menu)
    Check $t "the menu resolved as dismissed" ((Get-MenuOutcome $menu) -match "dismissed")
  }

  Invoke-Test "owner-close" "Closing the window that owns an open menu closes the menu and the app keeps working" {
    param($t)
    $owner = $script:Session.Second
    Require $t "a second window is open" ($owner -ne [IntPtr]::Zero -and [MenuProbe]::IsWindow($owner))
    $menu = Open-Menu $t $owner "Probe Second"
    Require $t "the native menu opened in the second window" ([bool]$menu)
    $t.facts.Add("menu owner from the log: $(@(Get-LinesSince $menu.Mark 'owner 0x[0-9a-f]+')[0])")
    [MenuProbe]::PostMessageW($owner, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
    $gone = Wait-For { -not [MenuProbe]::IsWindow($owner) -or -not [MenuProbe]::IsWindowVisible($owner) } 6000
    $dialogs = @(Get-DialogWindows)
    if ($dialogs.Count) { $t.facts.Add("a dialog appeared: '$($dialogs[0].Title)'") }
    Require $t "the owner window closed (no close confirmation stood in the way)" ([bool]$gone)
    Check $t "the menu closed with its owner" (Wait-MenuClosed $menu 4000)
    $t.facts.Add("menu outcome: $(Get-MenuOutcome $menu)")
    Check $t "the app is still running" (Test-Alive)
    Check $t "the remaining window's page answers DevTools" ((Try-Page "/field" "1 + 1") -eq 2)
    $again = Open-Menu $t $main "Probe Alpha"
    Check $t "a new menu opens in the remaining window" ([bool]$again)
    if ($again) { Send-Tap 0x1B; Check $t "and Escape closes it" (Wait-MenuClosed $again) }
  }

  Invoke-Test "quit" "Closing the last window with a menu open quits the app cleanly" {
    param($t)
    Require $t "three tabs opened" $setup
    $menu = Open-Menu $t $main "Probe Alpha"
    Require $t "the native menu opened" ([bool]$menu)
    $windows = @(Get-AppWindows)
    $t.facts.Add("app windows open: $($windows.Count)")
    foreach ($window in $windows) { [MenuProbe]::PostMessageW($window.Handle, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null }
    $exited = $script:Session.Process.WaitForExit(25000)
    $fatal = @(Get-LinesSince $menu.Mark '^fatal ')
    $t.facts.Add("quit lines: $((Get-LinesSince $menu.Mark 'quitting|asking the engine to quit|pop-up menu (dismissed|failed|chose)') -join ' / ')")
    Check $t "the app exited within 25 s" $exited
    if ($exited) {
      $code = $script:Session.Process.ExitCode
      $t.facts.Add("exit code $code")
      Check $t "the app exited with code 0 (exit code $code)" ($code -eq 0)
    }
    Check $t "no fatal log lines" ($fatal.Count -eq 0)
  }
  Add-Unsupported "menu-mixed-dpi" "Menu placement and interaction across displays with different DPI" "This probe has not exercised two physical or virtual displays with different effective DPI. Single-display CI does not establish mixed-DPI behavior."
}

function Invoke-SleepMode {
  $main = $script:Session.Main
  $setup = (Open-Tab $main "/alpha" "Probe Alpha") -and (Open-Tab $main "/form" "Probe Form") -and (Open-Tab $main "/audio" "Probe Audio") -and (Open-Tab $main "/bravo" "Probe Bravo")
  $script:Facts.Add("four local pages opened as tabs (Alpha, Form, Audio, Bravo), each loaded with its title, reporting visibilityState visible and shown as a row in the main window's sidebar: $setup")

  Invoke-Test "sleep-hidden" "Sleep Tab on a hidden tab discards it; selecting it again reloads with document.wasDiscarded" {
    param($t)
    Require $t "four tabs opened" $setup
    $loadId = Try-Page "/alpha" "window.__loadId"
    Require $t "Alpha is a hidden tab (visibilityState hidden) and Bravo is the visible one" ((Get-Visibility "/alpha") -eq "hidden" -and (Get-Visibility "/bravo") -eq "visible")
    Assert-Detached $t @("/alpha")
    $menu = Open-Menu $t $main "Probe Alpha"
    Require $t "the native menu opened" ([bool]$menu)
    Check $t "'Sleep Tab' is offered for a hidden loaded tab" (@($menu.Items | Where-Object { $_.Text -eq "Sleep Tab" }).Count -gt 0)
    Require $t "'Sleep Tab' was chosen with Down and Enter" (Select-MenuItem $t $menu "Sleep Tab")
    Check $t "the menu resolved with the 'sleep' choice" ((Wait-MenuClosed $menu) -and (Get-MenuOutcome $menu) -match "chose sleep$")
    Start-Sleep -Milliseconds 1500
    $t.facts.Add("Alpha after sleeping: DevTools page $(if (Get-Page '/alpha') { 'still listed' } else { 'gone' }), load id $(Try-Page '/alpha' 'window.__loadId' 2000) (was $loadId)")
    $again = Open-Menu $t $main "Probe Alpha"
    Require $t "the menu opened again on the slept tab" ([bool]$again)
    Check $t "'Sleep Tab' is no longer offered: the tab is asleep" (@($again.Items | Where-Object { $_.Text -eq "Sleep Tab" }).Count -eq 0)
    Send-Tap 0x1B
    Wait-MenuClosed $again | Out-Null
    $row = Find-Row $main "Probe Alpha"
    Require $t "the Alpha row is still in the sidebar" ([bool]$row)
    Send-Click $row.X $row.Y
    $woke = Wait-For { (Try-Page "/alpha" "document.readyState + ' ' + document.wasDiscarded" 2000) -eq "complete true" } 15000
    if ($woke -and (Get-Visibility "/alpha") -eq "visible") { $script:Front[$main.ToInt64()] = "/alpha" }
    $t.facts.Add("after selecting it: visibility $(Get-Visibility '/alpha'), page state $(Try-Page '/alpha' 'JSON.stringify({wasDiscarded: document.wasDiscarded, loadId: window.__loadId})')")
    Check $t "selecting it reloaded the page with document.wasDiscarded === true" ([bool]$woke)
  }

  Invoke-Test "sleep-front" "The front tab offers no Sleep Tab" {
    param($t)
    Require $t "four tabs opened" $setup
    $front = @(Get-VisiblePaths @("/alpha", "/bravo", "/form", "/audio"))
    $name = if ($front.Count -eq 1) { Get-RowName $front[0] } else { $null }
    Require $t "exactly one probe page reports visibilityState visible ('$($front -join ',')')" ([bool]$name)
    $menu = Open-Menu $t $main $name
    Require $t "the native menu opened" ([bool]$menu)
    Check $t "'Sleep Tab' is absent for the visible tab" (@($menu.Items | Where-Object { $_.Text -eq "Sleep Tab" }).Count -eq 0)
    Send-Tap 0x1B
    Check $t "Escape closed the menu" (Wait-MenuClosed $menu)
  }

  Invoke-Test "sleep-form" "A hidden tab holding typed input stays awake with its text after Sleep Tab" {
    param($t)
    Require $t "four tabs opened" $setup
    Require $t "the Form tab came to the front from a click on its sidebar row (its page reports visibilityState visible)" (Select-Row $main "Probe Form")
    Start-Sleep -Milliseconds 600
    $point = Get-PagePoint $main
    Send-Click $point.X $point.Y
    [MenuProbe]::TypeText("keep123")
    Start-Sleep -Milliseconds 400
    $loadId = Try-Page "/form" "window.__loadId"
    Require $t "the form field holds the typed text" ((Try-Page "/form" "document.getElementById('f').value") -eq "keep123")
    Require $t "another tab came to the front: Bravo visible from a row click" (Select-Row $main "Probe Bravo")
    Require $t "the Form page is hidden" ((Get-Visibility "/form") -eq "hidden")
    Assert-Detached $t @("/form")
    $menu = Open-Menu $t $main "Probe Form"
    Require $t "the native menu opened" ([bool]$menu)
    $offered = @($menu.Items | Where-Object { $_.Text -eq "Sleep Tab" }).Count -gt 0
    $t.facts.Add("'Sleep Tab' offered: $offered")
    if ($offered) {
      Require $t "'Sleep Tab' was chosen" (Select-MenuItem $t $menu "Sleep Tab")
      Wait-MenuClosed $menu | Out-Null
    } else { Send-Tap 0x1B; Wait-MenuClosed $menu | Out-Null }
    Start-Sleep -Milliseconds 4000
    $state = Try-Page "/form" "JSON.stringify({value: document.getElementById('f').value, loadId: window.__loadId, wasDiscarded: document.wasDiscarded})"
    $t.facts.Add("form page after the sleep request: $state")
    $parsed = if ($state) { $state | ConvertFrom-Json } else { $null }
    Check $t "the page was not discarded: same load and text 'keep123'" ($parsed -and $parsed.loadId -eq $loadId -and $parsed.value -eq "keep123" -and -not $parsed.wasDiscarded)
  }

  Invoke-Test "sleep-audio" "A hidden tab playing audio stays awake after Sleep Tab" {
    param($t)
    Require $t "four tabs opened" $setup
    Require $t "the Audio tab came to the front from a click on its sidebar row (its page reports visibilityState visible)" (Select-Row $main "Probe Audio")
    Start-Sleep -Milliseconds 600
    $point = Get-PagePoint $main
    Send-Click $point.X $point.Y
    $playing = Wait-For { (Try-Page "/audio" "window.__ctx ? window.__ctx.state : 'none'" 2000) -eq "running" } 4000
    $devices = @(Get-CimInstance Win32_SoundDevice -ErrorAction SilentlyContinue).Count
    $t.facts.Add("sound devices on this machine: $devices")
    Require $t "the page's audio started from a click" ([bool]$playing)
    $loadId = Try-Page "/audio" "window.__loadId"
    Require $t "another tab came to the front: Bravo visible from a row click" (Select-Row $main "Probe Bravo")
    Require $t "the Audio page is hidden" ((Get-Visibility "/audio") -eq "hidden")
    Start-Sleep -Milliseconds 800
    Assert-Detached $t @("/audio")
    $menu = Open-Menu $t $main "Probe Audio"
    Require $t "the native menu opened" ([bool]$menu)
    if (@($menu.Items | Where-Object { $_.Text -eq "Sleep Tab" }).Count) {
      Require $t "'Sleep Tab' was chosen" (Select-MenuItem $t $menu "Sleep Tab")
      Wait-MenuClosed $menu | Out-Null
    } else { $t.facts.Add("'Sleep Tab' not offered"); Send-Tap 0x1B; Wait-MenuClosed $menu | Out-Null }
    Start-Sleep -Milliseconds 4000
    $state = Try-Page "/audio" "JSON.stringify({state: window.__ctx && window.__ctx.state, time: window.__ctx && window.__ctx.currentTime, loadId: window.__loadId, wasDiscarded: document.wasDiscarded})"
    $t.facts.Add("audio page after the sleep request: $state")
    $parsed = if ($state) { $state | ConvertFrom-Json } else { $null }
    if (-not ($parsed -and $parsed.loadId -eq $loadId) -and $devices -eq 0) { throw "precondition: this machine has no sound device, so Chrome may not count the page as audible" }
    Check $t "the playing page was not discarded: same load, audio still running" ($parsed -and $parsed.loadId -eq $loadId -and $parsed.state -eq "running" -and -not $parsed.wasDiscarded)
  }

  Add-Unsupported "sleep-group-nested" "Sleep Tabs on a group with a nested group" "Not automated: building a nested group on Windows needs the group rename field and drag into a group, and the JS dev harness that could build it directly does not answer in a Windows release build unless the run's facts say it does."
  Add-Unsupported "sleep-pip" "A hidden tab in Picture in Picture stays awake" "Not automated: starting Picture in Picture needs a playing video and a user gesture on Windows, and its window is not covered by this probe."
  Add-Unsupported "sleep-shared-family" "A tab whose shared pinned family is visible offers no Sleep Tab" "Not automated: a shared pinned family needs pins set up through the pin UI, which this probe does not drive."
}

function New-SeedSession {
  $template = '{"version":11,"profiles":{"default":{"id":"default","name":"Personal","color":"plum","icon":null,"createdAt":1}},"profileOrder":["default"],"settings":{"restoreSession":true,"autoHideTabs":false,"memorySaver":false,"autoPictureInPicture":false,"warnBeforeClosingTabGroup":true,"warnBeforeClosingWindow":true},"windows":[{"id":"runtime-a","profileId":"default","tabIds":["pin-a","control-a","outside-a","pip-a","nested-a","nested-b","nested-c"],"activeTabIds":{"default":"control-a"},"tabLayout":"sidebar","frame":"__AFRAME__","createdAt":1},{"id":"runtime-b","profileId":"default","tabIds":["pin-b","control-b"],"activeTabIds":{"default":"control-b"},"tabLayout":"sidebar","frame":"__BFRAME__","createdAt":2}],"windowOrder":["runtime-a","runtime-b"],"focusedWindowId":"runtime-a","lastProfileId":"default","tabs":[{"id":"pin-a","windowId":"runtime-a","profileId":"default","url":"__BASE__/pin","title":"Seed Pin","favicon":null,"pin":{"as":"row"},"muted":false,"zoom":1,"customTitle":null,"customIcon":null,"pinnedUrl":"__BASE__/pin","page":{"kind":"idle"},"openerId":null,"engine":"chromium","createdAt":1,"lastActiveAt":1,"pinKey":"runtime-shared-pin"},{"id":"pin-b","windowId":"runtime-b","profileId":"default","url":"__BASE__/pin","title":"Seed Pin","favicon":null,"pin":{"as":"row"},"muted":false,"zoom":1,"customTitle":null,"customIcon":null,"pinnedUrl":"__BASE__/pin","page":{"kind":"idle"},"openerId":null,"engine":"chromium","createdAt":1,"lastActiveAt":1,"pinKey":"runtime-shared-pin"},{"id":"control-a","windowId":"runtime-a","profileId":"default","url":"__BASE__/control-a","title":"Seed Control A","favicon":null,"pin":null,"muted":false,"zoom":1,"customTitle":null,"customIcon":null,"pinnedUrl":null,"page":{"kind":"idle"},"openerId":null,"engine":"chromium","createdAt":1,"lastActiveAt":1},{"id":"control-b","windowId":"runtime-b","profileId":"default","url":"__BASE__/control-b","title":"Seed Control B","favicon":null,"pin":null,"muted":false,"zoom":1,"customTitle":null,"customIcon":null,"pinnedUrl":null,"page":{"kind":"idle"},"openerId":null,"engine":"chromium","createdAt":1,"lastActiveAt":1},{"id":"nested-a","windowId":"runtime-a","profileId":"default","url":"__BASE__/nested-a","title":"Seed Nested A","favicon":null,"pin":null,"muted":false,"zoom":1,"customTitle":null,"customIcon":null,"pinnedUrl":null,"page":{"kind":"idle"},"openerId":null,"engine":"chromium","createdAt":1,"lastActiveAt":1},{"id":"nested-b","windowId":"runtime-a","profileId":"default","url":"__BASE__/nested-b","title":"Seed Nested B","favicon":null,"pin":null,"muted":false,"zoom":1,"customTitle":null,"customIcon":null,"pinnedUrl":null,"page":{"kind":"idle"},"openerId":null,"engine":"chromium","createdAt":1,"lastActiveAt":1},{"id":"nested-c","windowId":"runtime-a","profileId":"default","url":"__BASE__/nested-c","title":"Seed Nested C","favicon":null,"pin":null,"muted":false,"zoom":1,"customTitle":null,"customIcon":null,"pinnedUrl":null,"page":{"kind":"idle"},"openerId":null,"engine":"chromium","createdAt":1,"lastActiveAt":1},{"id":"outside-a","windowId":"runtime-a","profileId":"default","url":"__BASE__/outside-a","title":"Seed Outside","favicon":null,"pin":null,"muted":false,"zoom":1,"customTitle":null,"customIcon":null,"pinnedUrl":null,"page":{"kind":"idle"},"openerId":null,"engine":"chromium","createdAt":1,"lastActiveAt":1},{"id":"pip-a","windowId":"runtime-a","profileId":"default","url":"__BASE__/pip","title":"Seed Video","favicon":null,"pin":null,"muted":false,"zoom":1,"customTitle":null,"customIcon":null,"pinnedUrl":null,"page":{"kind":"idle"},"openerId":null,"engine":"chromium","createdAt":1,"lastActiveAt":1}],"groups":[{"id":"runtime-root","windowId":"runtime-a","profileId":"default","name":"Runtime Outer","icon":null,"color":null,"collapsed":false,"pinned":false,"tabIds":["nested-a","nested-b","nested-c"],"createdAt":1},{"id":"runtime-child","windowId":"runtime-a","profileId":"default","name":"Runtime Inner","icon":null,"color":null,"collapsed":false,"pinned":false,"tabIds":["nested-b","nested-c"],"createdAt":1,"parentId":"runtime-root"},{"id":"runtime-grandchild","windowId":"runtime-a","profileId":"default","name":"Runtime Deep","icon":null,"color":null,"collapsed":false,"pinned":false,"tabIds":["nested-c"],"createdAt":1,"parentId":"runtime-child"}],"splits":[]}'
  $area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
  $graphics = [System.Drawing.Graphics]::FromHwnd([IntPtr]::Zero)
  try { $scale = $graphics.DpiX / 96.0 } finally { $graphics.Dispose() }
  $width = [int]($area.Width * 0.55 / $scale)
  $height = [int](($area.Height - 10) / $scale)
  $left = [int]($area.Left / $scale)
  $top = [int]($area.Top / $scale)
  $right = [int]($area.Right / $scale)
  return $template.Replace("__BASE__", $script:Server.Base).Replace('"__AFRAME__"', "[$left,$top,$width,$height]").Replace('"__BFRAME__"', "[$($right - $width),$top,$width,$height]")
}

function Get-TreeWindows {
  if (-not (Test-Alive)) { return @() }
  Watch-OwnedTree $script:Session.Tree
  $ids = @([uint32]$script:Session.Process.Id) + @($script:Session.Tree.Owned.Keys | ForEach-Object { [uint32]$_ })
  $found = @()
  foreach ($id in @($ids | Select-Object -Unique)) { try { $found += @([MenuProbe]::VisibleWindowsOf($id)) } catch { } }
  return @($found)
}

function Format-Handle([IntPtr]$Window) { return "0x{0:x}" -f $Window.ToInt64() }

function Get-Elapsed { return [Math]::Round(((Get-Date) - $started).TotalSeconds, 2) }

function Get-SeedPage([string]$Path) { return Get-Page "$([regex]::Escape($Path))$" }

function Get-Hits([string]$Path) { return [int]$script:Server.Hits[$Path] }

function Read-SeedToken([string]$Path) {
  $value = Try-Page "$([regex]::Escape($Path))$" "JSON.stringify({loadId: window.__loadId, wasDiscarded: document.wasDiscarded, state: document.readyState, url: location.href})" 3000
  if (-not $value) { return $null }
  return $value | ConvertFrom-Json
}

function Wait-SeedLoaded([string]$Path, [int]$Milliseconds = 15000) {
  $expected = "$($script:Server.Base)$Path"
  return Wait-For { $token = Read-SeedToken $Path; if ($token -and $token.state -eq "complete" -and $token.url -eq $expected) { $token } } $Milliseconds
}

function Test-ItemOffered($Menu, [string]$Text) { return @($Menu.Items | Where-Object { -not $_.Separator -and $_.Text -eq $Text -and -not $_.Grayed }).Count -gt 0 }

function Get-AttachedState([string[]]$Paths) {
  $version = Invoke-Json "/json/version"
  $ids = [ordered]@{}
  foreach ($path in $Paths) {
    $page = Get-SeedPage $path
    if (-not $page) { throw "no DevTools page for $path" }
    $ids[$path] = $page.id
  }
  $browser = [CdpSession]::new($version.webSocketDebuggerUrl, 4000)
  try {
    $state = [ordered]@{}
    foreach ($entry in $ids.GetEnumerator()) {
      $reply = $browser.Send("Target.getTargetInfo", (@{ targetId = $entry.Value } | ConvertTo-Json -Compress), 5000) | ConvertFrom-Json
      $state[$entry.Key] = if ($reply.result.targetInfo) { [bool]$reply.result.targetInfo.attached } else { $null }
    }
    return $state
  } finally { $browser.Dispose() }
}

function Format-Attached($State) {
  if (-not $State) { return "unavailable" }
  return (@($State.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ", ")
}

function Assert-Detached($Test, [string[]]$Paths) {
  $open = [CdpSession]::OpenPageConnections
  $unconfirmed = [CdpSession]::UnconfirmedPageCloses
  Require $Test "all probe page connections closed with acknowledged WebSocket close handshakes" ($open -eq 0 -and $unconfirmed -eq 0)
  Start-Sleep -Milliseconds 300
  $state = try { Get-AttachedState $Paths } catch { $null }
  $Test.facts.Add("probe page connections open: $open; unconfirmed closes: $unconfirmed; browser Target.getTargetInfo attached flags: $(Format-Attached $state). Windows keeps an internal PageLinks client attached, so these flags do not identify external inspection. Actual discard controls use the same probe connection lifecycle.")
}

function Close-Dialogs {
  foreach ($dialog in @(Get-DialogWindows)) {
    if (Focus-Window $dialog.Handle) { Send-Tap 0x1B }
    Start-Sleep -Milliseconds 400
    if ([MenuProbe]::IsWindow($dialog.Handle) -and [MenuProbe]::IsWindowVisible($dialog.Handle)) { [MenuProbe]::PostMessageW($dialog.Handle, 0x0111, [IntPtr]2, [IntPtr]::Zero) | Out-Null }
  }
}

function Get-SeedTopology($Window) {
  return [pscustomobject]@{
    Handle = $Window.Handle; Title = $Window.Title
    ControlA = [bool](Find-Row $Window.Handle "Seed Control A" 1)
    Outer = [bool](Find-Row $Window.Handle "Runtime Outer" 1)
    ControlB = [bool](Find-Row $Window.Handle "Seed Control B" 1)
    Pin = [bool](Find-Row $Window.Handle "Seed Pin" 1)
  }
}

function Format-Topology($Rows) { return (@($Rows | ForEach-Object { "$(Format-Handle $_.Handle) '$($_.Title)' rows: Seed Control A $($_.ControlA), Runtime Outer $($_.Outer), Seed Control B $($_.ControlB), Seed Pin $($_.Pin)" }) -join '; ') }

function Initialize-SeedWindows {
  $script:SeedRows = @()
  $pair = Wait-For {
    $rows = @(Get-AppWindows | ForEach-Object { Get-SeedTopology $_ })
    $script:SeedRows = $rows
    $first = @($rows | Where-Object { $_.ControlA -and $_.Outer -and $_.Pin -and -not $_.ControlB })
    $second = @($rows | Where-Object { $_.ControlB -and $_.Pin -and -not $_.ControlA -and -not $_.Outer })
    if ($first.Count -eq 1 -and $second.Count -eq 1) { [pscustomobject]@{ A = $first[0].Handle; B = $second[0].Handle } }
  } 30000
  if (-not $pair) {
    $script:Facts.Add("the seeded session did not restore two windows told apart by their sidebar rows (A: Seed Control A, Runtime Outer and Seed Pin without Seed Control B; B: Seed Control B and Seed Pin without A's rows); app windows: $(Format-Topology $script:SeedRows)")
    return $null
  }
  $area = $script:Session.Area
  $width = [int]($area.Width * 0.55)
  [MenuProbe]::SetWindowPos($pair.A, [IntPtr]::Zero, $area.Left, $area.Top, $width, $area.Height - 10, 0x0040) | Out-Null
  [MenuProbe]::SetWindowPos($pair.B, [IntPtr]::Zero, $area.Right - $width, $area.Top, $width, $area.Height - 10, 0x0040) | Out-Null
  Start-Sleep -Milliseconds 1000
  $script:Session.Main = $pair.A
  $script:Session.Second = $pair.B
  $controls = Wait-For { (Get-Visibility "/control-a") -eq "visible" -and (Get-Visibility "/control-b") -eq "visible" } 15000
  $baseline = try { Get-AttachedState @("/control-a", "/control-b") } catch { $null }
  $script:Facts.Add("seeded windows A $(Format-Handle $pair.A) and B $(Format-Handle $pair.B) told apart by their sidebar rows ($(Format-Topology $script:SeedRows)) and placed side by side; their control pages report visibilityState visible: $([bool]$controls); browser-endpoint attached flags before any probe page session, which also read true while only an engine-held client is attached: $(Format-Attached $baseline)")
  if (-not $controls) { return $null }
  $script:Front[$pair.A.ToInt64()] = "/control-a"
  $script:Front[$pair.B.ToInt64()] = "/control-b"
  return $pair
}

function Invoke-SeedSleepMode {
  $pair = Initialize-SeedWindows
  $a = if ($pair) { $pair.A } else { [IntPtr]::Zero }
  $b = if ($pair) { $pair.B } else { [IntPtr]::Zero }
  $members = @(
    [pscustomobject]@{ Row = "Seed Nested A"; Path = "/nested-a" },
    [pscustomobject]@{ Row = "Seed Nested B"; Path = "/nested-b" },
    [pscustomobject]@{ Row = "Seed Nested C"; Path = "/nested-c" }
  )

  Invoke-Test "seed-nested-group" "Sleep Tabs on a three-level nested group discards its three loaded hidden tabs and leaves a loaded outside tab alone" {
    param($t)
    Require $t "the seeded windows A and B were restored" ([bool]$pair)
    $loaded = @{}
    foreach ($entry in @($members) + @([pscustomobject]@{ Row = "Seed Outside"; Path = "/outside-a" })) {
      $selected = Select-Row $a $entry.Row
      $loaded[$entry.Path] = $selected -and [bool](Wait-SeedLoaded $entry.Path)
    }
    $t.facts.Add("loaded by native row clicks: $((@($loaded.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" })) -join ', ')")
    Require $t "each nested member and the outside tab loaded its own page" (-not @($loaded.Values | Where-Object { -not $_ }).Count)
    Require $t "window A shows its control tab again" (Select-Row $a "Seed Control A")
    Require $t "window B still shows its control tab (its page reports visibilityState visible)" ((Get-Visibility "/control-b") -eq "visible")
    $before = @{}
    foreach ($path in @($members.Path) + @("/outside-a")) { $before[$path] = Read-SeedToken $path }
    Require $t "every member's load token was read before the action" (-not @($before.Values | Where-Object { -not $_ -or -not $_.loadId -or $_.wasDiscarded }).Count)
    $hits = @{}
    foreach ($path in $before.Keys) { $hits[$path] = Get-Hits $path }
    Assert-Detached $t (@($members.Path) + @("/outside-a"))
    $menu = Open-Menu $t $a "Runtime Outer"
    Require $t "the native group menu opened on Runtime Outer" ([bool]$menu)
    Check $t "'Sleep Tabs' is offered and enabled for the nested group" (Test-ItemOffered $menu "Sleep Tabs")
    Require $t "'Sleep Tabs' was chosen with Down and Enter" (Select-MenuItem $t $menu "Sleep Tabs")
    Check $t "the menu resolved with the 'sleep' choice" ((Wait-MenuClosed $menu) -and (Get-MenuOutcome $menu) -match "chose sleep$")
    Start-Sleep -Milliseconds 2500
    $again = Open-Menu $t $a "Runtime Outer"
    if ($again) {
      Check $t "'Sleep Tabs' is greyed afterwards: no member is left to sleep" (@($again.Items | Where-Object { $_.Text -eq "Sleep Tabs" -and $_.Grayed }).Count -eq 1)
      Send-Tap 0x1B
      Wait-MenuClosed $again | Out-Null
    } else { Check $t "the group menu opened again after the action" $false }
    Check $t "no seeded page reloaded before it was selected again" (-not @($hits.Keys | Where-Object { (Get-Hits $_) -ne $hits[$_] }).Count)
    foreach ($entry in $members) {
      $woke = (Select-Row $a $entry.Row) -and [bool](Wait-SeedLoaded $entry.Path)
      $after = Read-SeedToken $entry.Path
      $t.facts.Add("$($entry.Path): before $($before[$entry.Path] | ConvertTo-Json -Compress), after $($after | ConvertTo-Json -Compress), server loads $($hits[$entry.Path]) -> $(Get-Hits $entry.Path)")
      Check $t "$($entry.Row) reloaded on selection with document.wasDiscarded === true, a new load token and one new server load" ($woke -and $after -and $after.wasDiscarded -eq $true -and $after.loadId -ne $before[$entry.Path].loadId -and (Get-Hits $entry.Path) -eq $hits[$entry.Path] + 1)
    }
    $outside = (Select-Row $a "Seed Outside") -and [bool](Wait-SeedLoaded "/outside-a")
    $after = Read-SeedToken "/outside-a"
    $t.facts.Add("/outside-a: before $($before['/outside-a'] | ConvertTo-Json -Compress), after $($after | ConvertTo-Json -Compress), server loads $($hits['/outside-a']) -> $(Get-Hits '/outside-a')")
    Check $t "the outside tab kept its page: same load token, not discarded, no new server load" ($outside -and $after -and $after.loadId -eq $before["/outside-a"].loadId -and -not $after.wasDiscarded -and (Get-Hits "/outside-a") -eq $hits["/outside-a"])
    Select-Row $a "Seed Control A" | Out-Null
  }

  $script:SharedReady = $false
  Invoke-Test "seed-shared-pin-visible" "A shared pin whose page shows in the other window offers no Sleep Tab, and the page keeps its load" {
    param($t)
    Require $t "the seeded windows A and B were restored" ([bool]$pair)
    Require $t "B's pin row came to the front first" (Select-Row $b "Seed Pin")
    $before = Wait-SeedLoaded "/pin"
    Require $t "B's pin loaded $($script:Server.Base)/pin" ([bool]$before)
    $hits = Get-Hits "/pin"
    Require $t "B's pin is its visible page: Seed Control B reports visibilityState hidden" ((Get-Visibility "/control-b") -eq "hidden")
    Require $t "A's pin row came to the front last, taking the loaded holder while B stays visible as its frozen copy (A's control page hid)" (Select-Row $a "Seed Pin")
    Start-Sleep -Milliseconds 1200
    $pages = @(Get-Targets | Where-Object { $_.url -eq "$($script:Server.Base)/pin" }).Count
    $t.facts.Add("after A selected its pin last: $pages DevTools page(s) at /pin, server loads $hits -> $(Get-Hits '/pin'), /pin visibility $(Get-Visibility '/pin'), Seed Control B visibility $(Get-Visibility '/control-b')")
    Require $t "A took the same page while B retained its shared copy (one /pin page, no second load)" ($pages -eq 1 -and (Get-Hits "/pin") -eq $hits)
    Require $t "A shows its control tab again" (Select-Row $a "Seed Control A")
    $holder = Wait-For { (Get-Visibility "/pin") -eq "hidden" -and (Get-Visibility "/control-b") -eq "hidden" } 4000
    $t.facts.Add("after A returned to its control tab: /pin visibility $(Get-Visibility '/pin'), Seed Control B visibility $(Get-Visibility '/control-b'), B's owned page window $(if ($page = Get-PageWindow $b) { Format-Handle $page.Handle } else { 'none visible' })")
    Require $t "A holds the live page and B shows its frozen copy: the /pin page hid with A's pin tab while B's only other tab, Seed Control B, stays hidden" ([bool]$holder)
    Assert-Detached $t @("/pin")
    $menu = Open-Menu $t $a "Seed Pin"
    Require $t "the native menu opened on A's pin" ([bool]$menu)
    Check $t "'Sleep Tab' is absent on A's pin while its shared page shows in B" (@($menu.Items | Where-Object { $_.Text -eq "Sleep Tab" }).Count -eq 0)
    Send-Tap 0x1B
    Check $t "Escape closed the menu" (Wait-MenuClosed $menu)
    Start-Sleep -Milliseconds 1500
    $after = Read-SeedToken "/pin"
    $t.facts.Add("/pin before $($before | ConvertTo-Json -Compress), after $($after | ConvertTo-Json -Compress), server loads $hits -> $(Get-Hits '/pin'); B title '$([MenuProbe]::TitleOf($b))'")
    Check $t "the shared page kept its original load token and was not discarded" ($after -and $after.loadId -eq $before.loadId -and -not $after.wasDiscarded -and $after.url -eq "$($script:Server.Base)/pin")
    Check $t "the server saw no reload of the shared page" ((Get-Hits "/pin") -eq $hits)
    Check $t "B still shows the shared pin: Seed Control B stays hidden and the live /pin page stays hidden in A" ((Get-Visibility "/control-b") -eq "hidden" -and (Get-Visibility "/pin") -eq "hidden")
    $script:SharedReady = $true
  }

  Invoke-Test "seed-shared-pin-hidden" "Control: once the shared page shows in no window, its pin offers Sleep Tab and sleeping it discards the page" {
    param($t)
    Require $t "the visible shared-pin case reached its menu" $script:SharedReady
    Require $t "B shows its control tab" (Select-Row $b "Seed Control B")
    Require $t "A shows its control tab (its page reports visibilityState visible)" ((Get-Visibility "/control-a") -eq "visible")
    Require $t "the shared page is hidden in every window" ((Get-Visibility "/pin") -eq "hidden")
    $before = Read-SeedToken "/pin"
    Require $t "the shared page is still loaded" ($before -and $before.loadId)
    $hits = Get-Hits "/pin"
    Assert-Detached $t @("/pin")
    $owner = $a
    $menu = Open-Menu $t $a "Seed Pin"
    $offeredA = $menu -and (Test-ItemOffered $menu "Sleep Tab")
    $t.facts.Add("Sleep Tab offered on A's loaded holder after B hides its frozen copy: $([bool]$offeredA)")
    if (-not $offeredA -and $menu) { Send-Tap 0x1B; Wait-MenuClosed $menu | Out-Null }
    Require $t "'Sleep Tab' is offered on A's loaded holder once the family is hidden in both windows" $offeredA
    Require $t "'Sleep Tab' was chosen with Down and Enter" (Select-MenuItem $t $menu "Sleep Tab")
    Check $t "the menu resolved with the 'sleep' choice" ((Wait-MenuClosed $menu) -and (Get-MenuOutcome $menu) -match "chose sleep$")
    Start-Sleep -Milliseconds 2500
    Check $t "the page did not reload before it was selected again" ((Get-Hits "/pin") -eq $hits)
    $woke = (Select-Row $owner "Seed Pin") -and [bool](Wait-SeedLoaded "/pin")
    $after = Read-SeedToken "/pin"
    $t.facts.Add("/pin before $($before | ConvertTo-Json -Compress), after $($after | ConvertTo-Json -Compress), server loads $hits -> $(Get-Hits '/pin')")
    Check $t "selecting the pin reloaded the page with document.wasDiscarded === true, a new load token and one new server load" ($woke -and $after -and $after.wasDiscarded -eq $true -and $after.loadId -ne $before.loadId -and (Get-Hits "/pin") -eq $hits + 1)
    Select-Row $a "Seed Control A" | Out-Null
    Select-Row $b "Seed Control B" | Out-Null
  }

  $script:PipReady = $false
  $script:PipWindow = [IntPtr]::Zero
  Invoke-Test "seed-pip-paused" "A hidden tab in real, paused Chromium Picture in Picture stays loaded after Sleep Tab" {
    param($t)
    Require $t "the seeded windows A and B were restored" ([bool]$pair)
    Require $t "the video tab came to the front" (Select-Row $a "Seed Video")
    Require $t "the video page loaded" ([bool](Wait-SeedLoaded "/pip"))
    Require $t "the video has a decoded frame" ([bool](Wait-For { (Try-Page "/pip$" "document.getElementById('v').readyState" 2000) -ge 2 } 8000))
    $known = @(Get-TreeWindows | ForEach-Object { $_.Handle.ToInt64() })
    Focus-Window $a | Out-Null
    $point = Get-PagePoint $a
    Send-Click $point.X $point.Y
    $outcome = Wait-For { $value = Try-Page "/pip$" "window.__pip" 2000; if ($value) { $value } } 6000
    $t.facts.Add("requestPictureInPicture after a native click: $outcome")
    Require $t "requestPictureInPicture resolved from a native click ('$outcome')" ($outcome -eq "open")
    $window = Wait-For { @(Get-TreeWindows | Where-Object { $known -notcontains $_.Handle.ToInt64() -and $_.ClassName -eq "Chrome_WidgetWin_1" -and $_.Title -match "(?i)picture[ -]in[ -]picture" }) | Select-Object -First 1 } 5000
    if ($window) { $script:PipWindow = $window.Handle; $t.facts.Add("Picture in Picture window $(Format-Handle $window.Handle) class $($window.ClassName) title '$($window.Title)' $($window.Width)x$($window.Height), pid $([MenuProbe]::ProcessOf($window.Handle))") }
    Require $t "a new visible Chromium Chrome_WidgetWin_1 window titled Picture in picture appeared in the app's process tree" ([bool]$window)
    $state = Try-Page "/pip$" "JSON.stringify({active: document.pictureInPictureElement === document.getElementById('v'), paused: v.paused, muted: v.muted, audioBytes: v.webkitAudioDecodedByteCount, loadId: window.__loadId, url: location.href})"
    $t.facts.Add("page state in Picture in Picture: $state")
    $parsed = if ($state) { $state | ConvertFrom-Json } else { $null }
    Require $t "the video is the active Picture in Picture element, paused, muted and has decoded no audio" ($parsed -and $parsed.active -and $parsed.paused -and $parsed.muted -and $parsed.audioBytes -eq 0)
    $hits = Get-Hits "/pip"
    Require $t "window A shows its control tab, hiding the video tab" (Select-Row $a "Seed Control A")
    Start-Sleep -Milliseconds 800
    Require $t "the Picture in Picture window stays open with its tab hidden" ([MenuProbe]::IsWindow($script:PipWindow) -and [MenuProbe]::IsWindowVisible($script:PipWindow))
    Assert-Detached $t @("/pip")
    $menu = Open-Menu $t $a "Seed Video"
    Require $t "the native menu opened on the hidden video tab" ([bool]$menu)
    Require $t "'Sleep Tab' is offered (Windows JS has no Picture in Picture signal, so the engine decides)" (Test-ItemOffered $menu "Sleep Tab")
    Require $t "'Sleep Tab' was chosen with Down and Enter" (Select-MenuItem $t $menu "Sleep Tab")
    Check $t "the menu resolved with the 'sleep' choice" ((Wait-MenuClosed $menu) -and (Get-MenuOutcome $menu) -match "chose sleep$")
    Start-Sleep -Milliseconds 2500
    $script:PipReady = $true
    Check $t "the Picture in Picture window is still open after Sleep Tab" ([MenuProbe]::IsWindow($script:PipWindow) -and [MenuProbe]::IsWindowVisible($script:PipWindow))
    Check $t "the server saw no reload of the video page" ((Get-Hits "/pip") -eq $hits)
    $after = Try-Page "/pip$" "JSON.stringify({active: document.pictureInPictureElement === document.getElementById('v'), paused: v.paused, loadId: window.__loadId, wasDiscarded: document.wasDiscarded})"
    $t.facts.Add("page state after Sleep Tab: $after")
    $afterParsed = if ($after) { $after | ConvertFrom-Json } else { $null }
    Check $t "the hidden PiP page was not discarded: same load token, still the paused Picture in Picture element" ($afterParsed -and $afterParsed.loadId -eq $parsed.loadId -and $afterParsed.active -and $afterParsed.paused -and -not $afterParsed.wasDiscarded)
    $t.facts.Add("this exercises the engine's own keep rules; Windows sends no pipOpen signal to the JS menu guard, so it is not evidence for that branch")
  }

  Invoke-Test "seed-pip-control" "Control: the same hidden video tab sleeps once it leaves Picture in Picture" {
    param($t)
    Require $t "the Picture in Picture case reached its Sleep Tab with the page kept" ($script:PipReady -and (Get-SeedPage "/pip"))
    $exit = Try-Page "/pip$" "document.pictureInPictureElement ? (document.exitPictureInPicture(), 'exiting') : 'none'"
    $gone = Wait-For { -not [MenuProbe]::IsWindow($script:PipWindow) -or -not [MenuProbe]::IsWindowVisible($script:PipWindow) } 5000
    $t.facts.Add("exitPictureInPicture: $exit; window $(Format-Handle $script:PipWindow) gone: $([bool]$gone)")
    Require $t "the Picture in Picture window closed" ([bool]$gone)
    Require $t "the page has no Picture in Picture element" ((Try-Page "/pip$" "document.pictureInPictureElement === null") -eq $true)
    $before = Read-SeedToken "/pip"
    Require $t "the video page is still loaded" ($before -and $before.loadId)
    $hits = Get-Hits "/pip"
    Assert-Detached $t @("/pip")
    $menu = Open-Menu $t $a "Seed Video"
    Require $t "the native menu opened on the hidden video tab" ([bool]$menu)
    Require $t "'Sleep Tab' is offered" (Test-ItemOffered $menu "Sleep Tab")
    Require $t "'Sleep Tab' was chosen with Down and Enter" (Select-MenuItem $t $menu "Sleep Tab")
    Check $t "the menu resolved with the 'sleep' choice" ((Wait-MenuClosed $menu) -and (Get-MenuOutcome $menu) -match "chose sleep$")
    Start-Sleep -Milliseconds 2500
    Check $t "the page did not reload before it was selected again" ((Get-Hits "/pip") -eq $hits)
    $woke = (Select-Row $a "Seed Video") -and [bool](Wait-SeedLoaded "/pip")
    $after = Read-SeedToken "/pip"
    $t.facts.Add("/pip before $($before | ConvertTo-Json -Compress), after $($after | ConvertTo-Json -Compress), server loads $hits -> $(Get-Hits '/pip')")
    Check $t "selecting it reloaded the page with document.wasDiscarded === true, a new load token and one new server load" ($woke -and $after -and $after.wasDiscarded -eq $true -and $after.loadId -ne $before.loadId -and (Get-Hits "/pip") -eq $hits + 1)
  }
  if ($script:PipWindow -ne [IntPtr]::Zero -and [MenuProbe]::IsWindow($script:PipWindow)) { Try-Page "/pip$" "document.pictureInPictureElement && document.exitPictureInPicture(); 1" | Out-Null }
}

function Invoke-SeedMenuMode {
  $pair = Initialize-SeedWindows
  $a = if ($pair) { $pair.A } else { [IntPtr]::Zero }
  $b = if ($pair) { $pair.B } else { [IntPtr]::Zero }

  Invoke-Test "seed-confirm-and-menu" "A native Close Group confirm in window A and a tab menu in window B stay open together while a page loads; both close and input works again" {
    param($t)
    Require $t "the seeded windows A and B were restored" ([bool]$pair)
    Require $t "A's control page loaded" ([bool](Wait-SeedLoaded "/control-a"))
    Require $t "B's control page loaded" ([bool](Wait-SeedLoaded "/control-b"))
    $title = "Close $([char]0x201C)Runtime Outer$([char]0x201D)?"
    $timeline = [System.Collections.Generic.List[string]]::new()
    $dialog = $null
    $menu = $null
    try {
      $groupMenu = Open-Menu $t $a "Runtime Outer"
      Require $t "the native group menu opened in A" ([bool]$groupMenu)
      $dialogMark = Get-LogMark
      Require $t "'Close Group' was chosen with Down and Enter" (Select-MenuItem $t $groupMenu "Close Group")
      Check $t "the group menu resolved with the 'close' choice" ((Wait-MenuClosed $groupMenu) -and (Get-MenuOutcome $groupMenu) -match "chose close$")
      $dialog = Wait-For { @(Get-DialogWindows) | Select-Object -First 1 } 6000
      Require $t "a native confirm window (#32770) appeared" ([bool]$dialog)
      $timeline.Add("confirm $(Format-Handle $dialog.Handle) '$($dialog.Title)' visible at $(Get-Elapsed) s")
      $text = Wait-For { Find-VisibleText $title } 3000
      $t.facts.Add("confirm text found by UI Automation: $($text | ConvertTo-Json -Compress)")
      Check $t "the confirm shows '$title'" ([bool]$text)
      Check $t "the log shows the native confirm thread, not a test or background answer" ((Get-LinesSince $dialogMark '^dialog \d+ confirm thread started').Count -gt 0 -and (Get-LinesSince $dialogMark 'alert \(not shown\)|dialog\.json').Count -eq 0)
      Check $t "window A is disabled while its confirm is open" (-not [MenuProbe]::IsWindowEnabled($a))
      Check $t "window B stays enabled" ([MenuProbe]::IsWindowEnabled($b))
      $menu = Open-Menu $t $b "Seed Control B"
      Require $t "a native tab menu opened in B while A's confirm is open" ([bool]$menu)
      $timeline.Add("menu $(Format-Handle $menu.Handle) shown at $(Get-Elapsed) s")
      $both = [MenuProbe]::IsWindowVisible($dialog.Handle) -and @(Get-MenuWindows | Where-Object { $_.Handle -eq $menu.Handle }).Count -gt 0
      Save-Shot $t "confirm-and-menu"
      Check $t "the confirm and the menu are visible at the same time" $both
      $target = "$($script:Server.Base)/progress?n=seed$PID"
      $hits = Get-Hits "/progress"
      $loaded = $null
      $navigateMs = $null
      $page = Get-SeedPage "/control-b"
      if ($page) {
        $devtools = [CdpSession]::new($page.webSocketDebuggerUrl, 4000)
        try {
          $devtools.Send("Page.enable", "{}", 5000) | Out-Null
          $clock = [System.Diagnostics.Stopwatch]::StartNew()
          $devtools.Send("Page.navigate", (@{ url = $target } | ConvertTo-Json -Compress), 8000) | Out-Null
          $loaded = $devtools.WaitEvent("Page.loadEventFired", 10000)
          $navigateMs = $clock.ElapsedMilliseconds
        } catch { $t.facts.Add("DevTools navigation failed while both were open: $($_.Exception.Message)") } finally { $devtools.Dispose() }
      }
      $timeline.Add("B's page navigation load event after $navigateMs ms, at $(Get-Elapsed) s")
      $href = Try-Page "/progress" "document.readyState + ' ' + location.href" 3000
      $stillMenu = @(Get-MenuWindows | Where-Object { $_.Handle -eq $menu.Handle }).Count -gt 0 -and -not (Get-LinesSince $menu.Mark '^menu \d+ pop-up menu (dismissed|chose|failed)').Count
      $stillDialog = [MenuProbe]::IsWindow($dialog.Handle) -and [MenuProbe]::IsWindowVisible($dialog.Handle)
      $t.facts.Add("after the navigation: page '$href', server loads of /progress $hits -> $(Get-Hits '/progress'), menu open $stillMenu, confirm open $stillDialog")
      Check $t "the engine finished loading a navigation in B while both stayed open" ([bool]$loaded -and $href -eq "complete $target" -and (Get-Hits "/progress") -gt $hits -and $stillMenu -and $stillDialog)
      Send-Tap 0x1B
      Check $t "Escape closed B's menu" (Wait-MenuClosed $menu)
      Check $t "B's menu resolved as dismissed" ((Get-MenuOutcome $menu) -match "dismissed")
      $timeline.Add("menu closed at $(Get-Elapsed) s")
      Check $t "A's confirm is still open after B's menu closed" ([MenuProbe]::IsWindow($dialog.Handle) -and [MenuProbe]::IsWindowVisible($dialog.Handle))
      $cancelMark = Get-LogMark
      if (Focus-Window $dialog.Handle) { Send-Tap 0x1B }
      $closed = Wait-For { -not [MenuProbe]::IsWindow($dialog.Handle) -or -not [MenuProbe]::IsWindowVisible($dialog.Handle) } 5000
      $timeline.Add("confirm closed at $(Get-Elapsed) s; log: $((Get-LinesSince $cancelMark '^dialog ') -join ' / ')")
      Check $t "Escape on the confirm cancelled it" ([bool]$closed)
      Start-Sleep -Milliseconds 600
      $t.facts.Add("foreground after the confirm closed: $(Describe-Foreground)")
      Check $t "window A is enabled again" ([MenuProbe]::IsWindowEnabled($a))
      Check $t "the group was kept: Runtime Outer is still in A's sidebar" ([bool](Find-Row $a "Runtime Outer"))
      Focus-Window $a | Out-Null
      $point = Get-PagePoint $a
      Send-Click $point.X $point.Y
      [MenuProbe]::TypeText("seed")
      Start-Sleep -Milliseconds 500
      $state = Try-Page "/control-a" "JSON.stringify({value: document.getElementById('f').value, focused: document.hasFocus(), active: document.activeElement && document.activeElement.id})"
      $t.facts.Add("A's page after typing: $state")
      $parsed = if ($state) { $state | ConvertFrom-Json } else { $null }
      Check $t "typing reaches A's page field again" ($parsed -and $parsed.value -eq "seed" -and $parsed.focused -and $parsed.active -eq "f")
      $again = Open-Menu $t $b "Progress seed$PID"
      Check $t "a new menu opens in B afterwards" ([bool]$again)
      if ($again) { Send-Tap 0x1B; Check $t "and Escape closes it" (Wait-MenuClosed $again) }
    } finally {
      $t.facts.Add("timeline: $($timeline -join '; ')")
      Close-Menus
      Close-Dialogs
    }
  }

  Add-Unsupported "seed-mixed-dpi" "Menus and confirms across displays with different DPI" "This probe has not exercised two physical or virtual displays with different effective DPI. Single-display CI does not establish mixed-DPI behavior."
}

$exitCode = 1
try {
  Note "Ardia Windows $Mode runtime verification: $App"
  Start-Server
  Start-Recorder
  Start-Ardia $(if ($Mode -like "Seed*") { New-SeedSession } else { "" })
  switch ($Mode) {
    "Menu" { Invoke-MenuMode }
    "Sleep" { Invoke-SleepMode }
    "SeedMenu" { Invoke-SeedMenuMode }
    "SeedSleep" { Invoke-SeedSleepMode }
  }
} catch {
  $script:Facts.Add("run error: $($_.Exception.Message)")
  Note "run error: $($_.Exception.Message)"
  $test = New-Test "run-error" "The run finished without an uncaught error"
  $test.status = "fail"
  $test.facts.Add("$(if ($script:Tests.Count) { "after $($script:Tests.Count) recorded tests" } else { 'before any test' }): $($_.Exception.Message)")
  $script:Tests.Add($test)
} finally {
  Release-Modifiers
  if ($script:Session) {
    Save-Shot $null "final"
    try {
      $exitedBefore = $script:Session.Process.HasExited
      Stop-OwnTree $script:Session.Tree -ChildrenOnly:$exitedBefore
      if (-not $script:Session.Process.HasExited) { $script:Session.Process.WaitForExit(10000) | Out-Null }
      $script:Facts.Add("app exited: $($script:Session.Process.HasExited) (already exited before cleanup: $exitedBefore); $(Format-TreeReport $script:Session.Tree)")
    } catch { $script:Facts.Add("app cleanup error: $($_.Exception.Message)") }
  }
  Stop-Recorder
  Stop-Server
  $env:ARDIA_DATA_DIR = ""
  $env:ARDIA_CONFIG_DIR = ""
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $dataRoot
  $verdict = Write-Results
  Note "verdict: $verdict"
  if ($env:GITHUB_STEP_SUMMARY) { Get-Content -LiteralPath $summaryFile | Add-Content -LiteralPath $env:GITHUB_STEP_SUMMARY }
  $exitCode = switch ($verdict) { "pass" { 0 } "fail" { 1 } default { 2 } }
}
exit $exitCode

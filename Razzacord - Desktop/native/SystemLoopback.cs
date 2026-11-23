// Captura de áudio por árvore de processos (WASAPI process loopback, Windows 10 2004+).
//
// Uso: SystemLoopback.exe <pid> <include|exclude>
//   include: só o áudio da árvore de processos do PID (áudio de um aplicativo).
//   exclude: todo o áudio do PC, menos a árvore do PID (usado com o PID do Razzacord,
//            assim as vozes da chamada nunca entram na transmissão).
// Saída: PCM s16le, 48 kHz, estéreo no stdout. Encerra quando o stdin fecha ou o stdout quebra.
//
// Compilado com o csc do .NET Framework 4.x que já vem no Windows (ver build.js), por isso C# 5.
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

namespace Razzacord.Native
{
    [ComImport, Guid("72A22D78-CDE4-431D-B8CC-843A71199B6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IActivateAudioInterfaceAsyncOperation
    {
        void GetActivateResult(out int activateResult, [MarshalAs(UnmanagedType.IUnknown)] out object activatedInterface);
    }

    [ComImport, Guid("41D949AB-9862-444A-80F6-C261334DA5EB"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IActivateAudioInterfaceCompletionHandler
    {
        void ActivateCompleted(IActivateAudioInterfaceAsyncOperation operation);
    }

    [ComImport, Guid("94EA2B94-E9CC-49E0-C0FF-EE64CA8F5B90"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAgileObject { }

    [ComImport, Guid("1CB9AD4C-DBFA-4C32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioClient
    {
        [PreserveSig] int Initialize(int shareMode, uint streamFlags, long bufferDuration, long periodicity, IntPtr format, IntPtr audioSessionGuid);
        [PreserveSig] int GetBufferSize(out uint frames);
        [PreserveSig] int GetStreamLatency(out long latency);
        [PreserveSig] int GetCurrentPadding(out uint padding);
        [PreserveSig] int IsFormatSupported(int shareMode, IntPtr format, out IntPtr closestMatch);
        [PreserveSig] int GetMixFormat(out IntPtr format);
        [PreserveSig] int GetDevicePeriod(out long defaultPeriod, out long minimumPeriod);
        [PreserveSig] int Start();
        [PreserveSig] int Stop();
        [PreserveSig] int Reset();
        [PreserveSig] int SetEventHandle(IntPtr eventHandle);
        [PreserveSig] int GetService(ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object service);
    }

    [ComImport, Guid("C8ADBD64-E71E-48A0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioCaptureClient
    {
        [PreserveSig] int GetBuffer(out IntPtr data, out uint frames, out uint flags, out ulong devicePosition, out ulong qpcPosition);
        [PreserveSig] int ReleaseBuffer(uint frames);
        [PreserveSig] int GetNextPacketSize(out uint frames);
    }

    // CCW do .NET Framework agrega o free-threaded marshaler, então o handler é ágil como a API exige.
    [ComVisible(true)]
    class CompletionHandler : IActivateAudioInterfaceCompletionHandler, IAgileObject
    {
        public readonly ManualResetEvent Done = new ManualResetEvent(false);
        public void ActivateCompleted(IActivateAudioInterfaceAsyncOperation operation)
        {
            Done.Set();
        }
    }

    static class Program
    {
        const string VirtualProcessLoopback = "VAD\\Process_Loopback";
        const int ActivationTypeProcessLoopback = 1;
        const int ModeIncludeTree = 0;
        const int ModeExcludeTree = 1;
        const ushort VtBlob = 65;

        const uint StreamFlagsLoopback = 0x00020000;
        const uint StreamFlagsEventCallback = 0x00040000;
        const uint StreamFlagsAutoConvertPcm = 0x80000000;
        const uint BufferFlagsSilent = 0x2;

        const int SampleRate = 48000;
        const int Channels = 2;
        const int BytesPerFrame = 4;

        [DllImport("Mmdevapi.dll", ExactSpelling = true, PreserveSig = false)]
        static extern void ActivateAudioInterfaceAsync(
            [MarshalAs(UnmanagedType.LPWStr)] string deviceInterfacePath,
            ref Guid riid,
            IntPtr activationParams,
            IActivateAudioInterfaceCompletionHandler completionHandler,
            out IActivateAudioInterfaceAsyncOperation activationOperation);

        static volatile bool stopping;

        [MTAThread]
        static int Main(string[] args)
        {
            uint pid;
            if (args.Length < 2 || !uint.TryParse(args[0], out pid) || (args[1] != "include" && args[1] != "exclude"))
            {
                Console.Error.WriteLine("uso: SystemLoopback.exe <pid> <include|exclude>");
                return 2;
            }
            int mode = args[1] == "include" ? ModeIncludeTree : ModeExcludeTree;

            try
            {
                Run(pid, mode);
                return 0;
            }
            catch (Exception e)
            {
                Console.Error.WriteLine("erro: " + e.Message);
                return 1;
            }
        }

        static IAudioClient Activate(uint pid, int mode)
        {
            // AUDIOCLIENT_ACTIVATION_PARAMS { ActivationType; { TargetProcessId; ProcessLoopbackMode } }
            IntPtr blob = Marshal.AllocHGlobal(12);
            // PROPVARIANT com VT_BLOB: vt (2) + reservados (6) + BLOB { cbSize (4) + pad (4) + pBlobData (8) }
            IntPtr prop = Marshal.AllocHGlobal(24);
            try
            {
                Marshal.WriteInt32(blob, 0, ActivationTypeProcessLoopback);
                Marshal.WriteInt32(blob, 4, (int)pid);
                Marshal.WriteInt32(blob, 8, mode);

                for (int i = 0; i < 24; i++) Marshal.WriteByte(prop, i, 0);
                Marshal.WriteInt16(prop, 0, (short)VtBlob);
                Marshal.WriteInt32(prop, 8, 12);
                Marshal.WriteIntPtr(prop, 16, blob);

                Guid iid = typeof(IAudioClient).GUID;
                var handler = new CompletionHandler();
                IActivateAudioInterfaceAsyncOperation op;
                ActivateAudioInterfaceAsync(VirtualProcessLoopback, ref iid, prop, handler, out op);
                if (!handler.Done.WaitOne(10000)) throw new Exception("tempo esgotado ativando a captura");

                int hr;
                object client;
                op.GetActivateResult(out hr, out client);
                if (hr < 0) Marshal.ThrowExceptionForHR(hr);
                return (IAudioClient)client;
            }
            finally
            {
                Marshal.FreeHGlobal(prop);
                Marshal.FreeHGlobal(blob);
            }
        }

        static void Check(int hr, string what)
        {
            if (hr < 0) throw new Exception(what + " falhou (0x" + hr.ToString("X8") + ")");
        }

        static void Run(uint pid, int mode)
        {
            IAudioClient client = Activate(pid, mode);

            // WAVEFORMATEX PCM 16 bits, 48 kHz, estéreo (18 bytes)
            IntPtr format = Marshal.AllocHGlobal(18);
            Marshal.WriteInt16(format, 0, 1);
            Marshal.WriteInt16(format, 2, Channels);
            Marshal.WriteInt32(format, 4, SampleRate);
            Marshal.WriteInt32(format, 8, SampleRate * BytesPerFrame);
            Marshal.WriteInt16(format, 12, BytesPerFrame);
            Marshal.WriteInt16(format, 14, 16);
            Marshal.WriteInt16(format, 16, 0);
            try
            {
                Check(client.Initialize(0,
                    StreamFlagsLoopback | StreamFlagsEventCallback | StreamFlagsAutoConvertPcm,
                    200000, 0, format, IntPtr.Zero), "Initialize");
            }
            finally
            {
                Marshal.FreeHGlobal(format);
            }

            var ready = new AutoResetEvent(false);
            Check(client.SetEventHandle(ready.SafeWaitHandle.DangerousGetHandle()), "SetEventHandle");

            Guid captureIid = typeof(IAudioCaptureClient).GUID;
            object service;
            Check(client.GetService(ref captureIid, out service), "GetService");
            var capture = (IAudioCaptureClient)service;

            // O processo pai encerra a captura fechando o stdin (ou matando o processo).
            var watcher = new Thread(() =>
            {
                try
                {
                    Stream input = Console.OpenStandardInput();
                    var buf = new byte[64];
                    while (input.Read(buf, 0, buf.Length) > 0) { }
                }
                catch { }
                stopping = true;
                ready.Set();
            });
            watcher.IsBackground = true;
            watcher.Start();

            Stream output = Console.OpenStandardOutput();
            byte[] chunk = new byte[SampleRate * BytesPerFrame]; // até 1 s por pacote
            Check(client.Start(), "Start");
            try
            {
                while (!stopping)
                {
                    ready.WaitOne(200);
                    uint packet;
                    Check(capture.GetNextPacketSize(out packet), "GetNextPacketSize");
                    while (packet > 0 && !stopping)
                    {
                        IntPtr data;
                        uint frames, flags;
                        ulong devicePos, qpcPos;
                        Check(capture.GetBuffer(out data, out frames, out flags, out devicePos, out qpcPos), "GetBuffer");

                        int bytes = (int)frames * BytesPerFrame;
                        if (bytes > chunk.Length) chunk = new byte[bytes];
                        if ((flags & BufferFlagsSilent) != 0) Array.Clear(chunk, 0, bytes);
                        else Marshal.Copy(data, chunk, 0, bytes);
                        Check(capture.ReleaseBuffer(frames), "ReleaseBuffer");

                        try
                        {
                            output.Write(chunk, 0, bytes);
                            output.Flush();
                        }
                        catch (IOException)
                        {
                            stopping = true; // o processo pai fechou o pipe
                            break;
                        }
                        Check(capture.GetNextPacketSize(out packet), "GetNextPacketSize");
                    }
                }
            }
            finally
            {
                client.Stop();
                Marshal.ReleaseComObject(capture);
                Marshal.ReleaseComObject(client);
            }
        }
    }
}

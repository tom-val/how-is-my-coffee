using System.Buffers.Binary;
using System.Security.Cryptography;

namespace Coffee.Api.Shared.Auth;

/// <summary>
/// A pure-managed scrypt (RFC 7914), here for exactly one reason: the old Node backend stored
/// <c>scryptSync(password, salt, 64)</c> hashes and those users must still be able to log in.
/// .NET has no built-in scrypt, and a P/Invoke to OpenSSL would not survive Native AOT on
/// <c>provided.al2023</c>, so the ~120 lines below are the cheapest way to keep the migration
/// transparent. New passwords are PBKDF2 (see <see cref="PasswordHasher"/>); a legacy hash is
/// upgraded the first time its owner logs in.
/// </summary>
internal static class Scrypt
{
    /// <summary>Node's <c>scryptSync</c> defaults: N=16384, r=8, p=1.</summary>
    public static byte[] DeriveKey(byte[] password, byte[] salt, int n, int r, int p, int dkLen)
    {
        if (n < 2 || (n & (n - 1)) != 0) throw new ArgumentException("N must be a power of two > 1", nameof(n));

        var blockSize = 128 * r;
        var b = Rfc2898DeriveBytes.Pbkdf2(password, salt, 1, HashAlgorithmName.SHA256, blockSize * p);

        var block = new byte[blockSize];
        for (var i = 0; i < p; i++)
        {
            Buffer.BlockCopy(b, i * blockSize, block, 0, blockSize);
            RoMix(block, n, r);
            Buffer.BlockCopy(block, 0, b, i * blockSize, blockSize);
        }

        return Rfc2898DeriveBytes.Pbkdf2(password, b, 1, HashAlgorithmName.SHA256, dkLen);
    }

    /// <summary>
    /// The memory-hard core: fill V with N successive BlockMix states, then take N pseudo-random
    /// walks back through it. This is what makes scrypt expensive to attack in parallel —
    /// N=16384, r=8 means a 16 MB working set per hash.
    /// </summary>
    private static void RoMix(byte[] block, int n, int r)
    {
        var blockSize = 128 * r;
        var v = new byte[(long)n * blockSize];
        var scratch = new byte[blockSize];

        for (var i = 0; i < n; i++)
        {
            Buffer.BlockCopy(block, 0, v, i * blockSize, blockSize);
            BlockMix(block, scratch, r);
        }

        for (var i = 0; i < n; i++)
        {
            var j = (int)(Integerify(block, r) & (uint)(n - 1));
            for (var k = 0; k < blockSize; k++) block[k] ^= v[(j * blockSize) + k];
            BlockMix(block, scratch, r);
        }
    }

    /// <summary>Chains 2r Salsa20/8 invocations, then interleaves the even and odd outputs.</summary>
    private static void BlockMix(byte[] block, byte[] scratch, int r)
    {
        var x = new byte[64];
        Buffer.BlockCopy(block, ((2 * r) - 1) * 64, x, 0, 64);

        for (var i = 0; i < 2 * r; i++)
        {
            for (var k = 0; k < 64; k++) x[k] ^= block[(i * 64) + k];
            Salsa20Core8(x);
            // Even outputs land in the first half, odd ones in the second.
            var target = ((i % 2) * r * 64) + ((i / 2) * 64);
            Buffer.BlockCopy(x, 0, scratch, target, 64);
        }

        Buffer.BlockCopy(scratch, 0, block, 0, 128 * r);
    }

    private static uint Integerify(byte[] block, int r) =>
        BinaryPrimitives.ReadUInt32LittleEndian(block.AsSpan(((2 * r) - 1) * 64, 4));

    private static void Salsa20Core8(byte[] block)
    {
        Span<uint> input = stackalloc uint[16];
        Span<uint> x = stackalloc uint[16];
        for (var i = 0; i < 16; i++)
        {
            input[i] = BinaryPrimitives.ReadUInt32LittleEndian(block.AsSpan(i * 4, 4));
            x[i] = input[i];
        }

        for (var round = 0; round < 8; round += 2)
        {
            // Column round.
            x[4] ^= Rotl(x[0] + x[12], 7); x[8] ^= Rotl(x[4] + x[0], 9);
            x[12] ^= Rotl(x[8] + x[4], 13); x[0] ^= Rotl(x[12] + x[8], 18);
            x[9] ^= Rotl(x[5] + x[1], 7); x[13] ^= Rotl(x[9] + x[5], 9);
            x[1] ^= Rotl(x[13] + x[9], 13); x[5] ^= Rotl(x[1] + x[13], 18);
            x[14] ^= Rotl(x[10] + x[6], 7); x[2] ^= Rotl(x[14] + x[10], 9);
            x[6] ^= Rotl(x[2] + x[14], 13); x[10] ^= Rotl(x[6] + x[2], 18);
            x[3] ^= Rotl(x[15] + x[11], 7); x[7] ^= Rotl(x[3] + x[15], 9);
            x[11] ^= Rotl(x[7] + x[3], 13); x[15] ^= Rotl(x[11] + x[7], 18);
            // Row round.
            x[1] ^= Rotl(x[0] + x[3], 7); x[2] ^= Rotl(x[1] + x[0], 9);
            x[3] ^= Rotl(x[2] + x[1], 13); x[0] ^= Rotl(x[3] + x[2], 18);
            x[6] ^= Rotl(x[5] + x[4], 7); x[7] ^= Rotl(x[6] + x[5], 9);
            x[4] ^= Rotl(x[7] + x[6], 13); x[5] ^= Rotl(x[4] + x[7], 18);
            x[11] ^= Rotl(x[10] + x[9], 7); x[8] ^= Rotl(x[11] + x[10], 9);
            x[9] ^= Rotl(x[8] + x[11], 13); x[10] ^= Rotl(x[9] + x[8], 18);
            x[12] ^= Rotl(x[15] + x[14], 7); x[13] ^= Rotl(x[12] + x[15], 9);
            x[14] ^= Rotl(x[13] + x[12], 13); x[15] ^= Rotl(x[14] + x[13], 18);
        }

        for (var i = 0; i < 16; i++)
        {
            BinaryPrimitives.WriteUInt32LittleEndian(block.AsSpan(i * 4, 4), x[i] + input[i]);
        }
    }

    private static uint Rotl(uint value, int bits) => (value << bits) | (value >> (32 - bits));
}

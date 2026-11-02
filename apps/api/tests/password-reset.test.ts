import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  passwordResetToken: {
    findUnique: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  },
  refreshToken: { updateMany: vi.fn() },
  $transaction: vi.fn(),
}));

const sendMailMock = vi.hoisted(() => vi.fn());

vi.mock("../src/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("../src/lib/auth", () => ({
  hashPassword: vi.fn(async () => "hashed-password"),
}));
vi.mock("../src/lib/mailer", () => ({
  sendMail: sendMailMock,
  mailConfigured: () => false,
}));

const {
  RESET_TOKEN_TTL_MINUTES,
  consumePasswordReset,
  createPasswordReset,
  hashResetToken,
} = await import("../src/lib/password-reset");

beforeEach(() => {
  Object.values(prismaMock).forEach(() => undefined);
  prismaMock.user.findUnique.mockReset();
  prismaMock.user.update.mockReset().mockResolvedValue({});
  prismaMock.passwordResetToken.findUnique.mockReset();
  prismaMock.passwordResetToken.create.mockReset().mockResolvedValue({});
  prismaMock.passwordResetToken.updateMany.mockReset().mockResolvedValue({ count: 1 });
  prismaMock.refreshToken.updateMany.mockReset().mockResolvedValue({ count: 1 });
  prismaMock.$transaction
    .mockReset()
    .mockImplementation(async (operations: Array<Promise<unknown>>) =>
      Promise.all(operations),
    );
  sendMailMock.mockReset().mockResolvedValue(true);
});

describe("hashResetToken", () => {
  it("menghasilkan hash SHA-256 deterministik, bukan token asli", () => {
    const hash = hashResetToken("token-rahasia");
    expect(hash).toHaveLength(64);
    expect(hash).toBe(hashResetToken("token-rahasia"));
    expect(hash).not.toContain("token-rahasia");
  });
});

describe("createPasswordReset", () => {
  it("tidak membuat token untuk email yang tidak terdaftar", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    expect(await createPasswordReset("tidak@ada.co")).toBeNull();
    expect(prismaMock.passwordResetToken.create).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("tidak membuat token untuk akun non-aktif", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "user@montreux.co",
      status: "INACTIVE",
    });
    expect(await createPasswordReset("user@montreux.co")).toBeNull();
    expect(prismaMock.passwordResetToken.create).not.toHaveBeenCalled();
  });

  it("mencabut token lama, menyimpan hash, dan mengirim email", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "user@montreux.co",
      status: "ACTIVE",
    });

    const result = await createPasswordReset("user@montreux.co");

    expect(result).not.toBeNull();
    expect(result?.email).toBe("user@montreux.co");
    expect(result?.link).toContain("/reset-password?token=");

    // Token lama dinonaktifkan sebelum token baru dibuat.
    expect(prismaMock.passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: { user_id: "user-1", used_at: null },
      data: { used_at: expect.any(Date) },
    });

    const createArgs = prismaMock.passwordResetToken.create.mock.calls[0][0];
    expect(createArgs.data.user_id).toBe("user-1");
    expect(createArgs.data.token_hash).toHaveLength(64);
    expect(createArgs.data.token_hash).toBe(
      hashResetToken(result!.link.split("token=")[1]),
    );
    expect(
      createArgs.data.expires_at.getTime() - Date.now(),
    ).toBeLessThanOrEqual(RESET_TOKEN_TTL_MINUTES * 60 * 1000);

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock.mock.calls[0][0].to).toBe("user@montreux.co");
    expect(sendMailMock.mock.calls[0][0].text).toContain("reset-password?token=");
  });
});

describe("consumePasswordReset", () => {
  const activeRecord = () => ({
    id: "reset-1",
    user_id: "user-1",
    used_at: null,
    expires_at: new Date(Date.now() + 10 * 60 * 1000),
    user: { id: "user-1", email: "user@montreux.co", status: "ACTIVE" },
  });

  it("menolak token terlalu pendek tanpa query database", async () => {
    const result = await consumePasswordReset("pendek", "PasswordBaru123!");
    expect(result).toEqual({ ok: false, reason: "INVALID" });
    expect(prismaMock.passwordResetToken.findUnique).not.toHaveBeenCalled();
  });

  it("menolak token yang tidak dikenal", async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue(null);
    expect(
      await consumePasswordReset("token-tidak-dikenal-1234567890", "PasswordBaru123!"),
    ).toEqual({ ok: false, reason: "INVALID" });
  });

  it("menolak token yang sudah dipakai", async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue({
      ...activeRecord(),
      used_at: new Date(),
    });
    expect(
      await consumePasswordReset("token-sudah-dipakai-1234567890", "PasswordBaru123!"),
    ).toEqual({ ok: false, reason: "USED" });
  });

  it("menolak token kedaluwarsa", async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue({
      ...activeRecord(),
      expires_at: new Date(Date.now() - 1000),
    });
    expect(
      await consumePasswordReset("token-kedaluwarsa-1234567890", "PasswordBaru123!"),
    ).toEqual({ ok: false, reason: "EXPIRED" });
  });

  it("menolak bila akun tidak aktif", async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue({
      ...activeRecord(),
      user: { id: "user-1", email: "user@montreux.co", status: "INACTIVE" },
    });
    expect(
      await consumePasswordReset("token-akun-nonaktif-1234567890", "PasswordBaru123!"),
    ).toEqual({ ok: false, reason: "INVALID" });
  });

  it("menolak jika token sudah diklaim request lain (race)", async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue(activeRecord());
    prismaMock.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });

    expect(
      await consumePasswordReset("token-balapan-1234567890", "PasswordBaru123!"),
    ).toEqual({ ok: false, reason: "USED" });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("mengganti password dan mencabut semua sesi pada token valid", async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue(activeRecord());

    const result = await consumePasswordReset(
      "token-valid-1234567890abcdef",
      "PasswordBaru123!",
    );

    expect(result).toEqual({ ok: true, email: "user@montreux.co" });

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { password_hash: "hashed-password" },
    });
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { user_id: "user-1", revoked_at: null },
      data: { revoked_at: expect.any(Date) },
    });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });
});

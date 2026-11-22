package com.api.Razzacord.model;

/** Bits de permissão por servidor. A ordem/valores são fixos: não alterar. */
public enum Permission {
    CREATE_INVITE(1),
    MANAGE_CHANNELS(2),
    MANAGE_SERVER(4),
    MANAGE_MESSAGES(8),
    KICK_MEMBERS(16),
    MUTE_MEMBERS(32),
    STREAM(64),
    MANAGE_ROLES(128);

    public static final long ALL = 255;

    private final long bit;

    Permission(long bit) {
        this.bit = bit;
    }

    public long bit() {
        return bit;
    }

    public static long of(Permission... permissions) {
        long mask = 0;
        for (Permission p : permissions) mask |= p.bit;
        return mask;
    }

    public static boolean has(long mask, Permission p) {
        return (mask & p.bit) != 0;
    }
}

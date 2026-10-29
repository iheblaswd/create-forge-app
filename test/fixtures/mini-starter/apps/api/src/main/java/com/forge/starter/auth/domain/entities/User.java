package com.forge.starter.auth.domain.entities;

import com.forge.starter.shared.domain.entities.BaseEntity;

/** Fixture only: owned by auth=jwt, removed when auth=none. Never compiled. */
public final class User extends BaseEntity {
    private final String email;

    public User(String email) {
        this.email = email;
    }

    public String email() {
        return email;
    }
}

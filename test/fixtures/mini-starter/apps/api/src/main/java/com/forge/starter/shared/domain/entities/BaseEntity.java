package com.forge.starter.shared.domain.entities;

import java.util.UUID;

/** Fixture only: part of shared, always copied. Never compiled. */
public abstract class BaseEntity {
    private final UUID id = UUID.randomUUID();

    public UUID id() {
        return id;
    }
}

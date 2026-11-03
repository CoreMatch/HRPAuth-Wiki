---
title: HASkinProxy
description: Lightweight Yggdrasil-to-CSL proxy that bridges HRPAuth to CustomSkinLoader clients, with transparent texture management passthrough.
order: 3
tags:
  - proxy
  - yggdrasil
  - csl
  - customskinloader
updatedAt: 2026-11-03
---

# HASkinProxy

HASkinProxy is a lightweight compatibility proxy that sits between a Yggdrasil-compliant authentication service (HRPAuth) and Minecraft clients using the [CustomSkinLoader](https://github.com/xfl03/MCCustomSkinLoader) (CSL) JSON protocol. It translates standard Yggdrasil session responses into CSL responses, and additionally forwards texture-management operations (upload / delete / get) to HRPAuth so the WEBUI and SDK can manage skins without talking to HRPAuth directly.

> **Note (2026-10 split)**: The Yggdrasil protocol surface and texture management are now provided by the separate [HRPAuth-Yggdrasil-API](https://github.com/CoreMatch/HRPAuth-Yggdrasil-API) service; HASkinProxy still talks to the HRPAuth core origin, which relays Yggdrasil traffic to that service. Skin library capabilities live in HASkinLib.

## Core Features

- **Yggdrasil → CSL translation**: resolves `username` → UUID, decodes the base64 `textures` property, and re-packages the skin / cape / elytra hashes into the CSL JSON shape.
- **Texture byte forwarding**: serves `/textures/:hash` from upstream storage transparently, forwarding `Content-Type`, `Last-Modified`, and `Cache-Control`.
- **Texture management passthrough**: exposes a forwarder for HRPAuth's `POST /texture/delete` so the dashboard / SDK can trigger skin deletion through the same origin.
- **In-process caching**: `freecache` for both profile data and texture bytes, with separate TTLs.
- **Microservice integration**: announces itself to HRPAuth via the `services/presence` handshake and registers relay rules so the SDK, setup page, and CSL API are reachable through the main service origin.

## When to use HASkinProxy

Use HASkinProxy when Minecraft clients in your network use CSL instead of the Yggdrasil session server for skin loading. The proxy keeps HRPAuth untouched and only adds a CSL-compatible surface plus a small management forwarder.

## Documentation

1. [API Reference](./api)
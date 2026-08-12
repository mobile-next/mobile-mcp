# MCP Tool Annotations Design

## Goal

Make the `readOnlyHint`, `destructiveHint`, and `openWorldHint` metadata in
`src/server.ts` accurately describe every registered MCP tool.

## Scope

This is an annotation-only change. Runtime behavior, including lazy iOS
simulator agent installation in `getRobotFromDevice`, remains unchanged.

## Annotation Model

Extend the local `ToolAnnotations` interface with `openWorldHint?: boolean`.
Every tool registration explicitly sets `openWorldHint`, avoiding the MCP
default of `true` for tools whose interaction domain is closed.

## Remote Device Tools

- `mobile_allocate_remote_device` is non-destructive because allocation adds a
  reservation. It remains open-world because it changes an external cloud
  fleet and may consume a billed or scarce resource.
- `mobile_release_remote_device` is destructive because releasing the device
  wipes session state. It remains open-world because it changes the external
  cloud fleet.

## Open-World Classification

The cloud login, cloud fleet, URL-opening, app-launching, UI interaction,
screen-content, and crash-content tools are open-world. They may communicate
with external services, act on arbitrary external content, or return untrusted
content originating outside the MCP server.

Bounded local discovery, application inventory and lifecycle, device geometry
and orientation, installation, local screenshot-file output, and screen
recording operations are closed-world.

## Read-Only Classification

The following tools are not declared read-only because their path through
`getRobotFromDevice` may install the mobile agent on an iOS simulator:

- `mobile_list_apps`
- `mobile_get_screen_size`
- `mobile_list_elements_on_screen`
- `mobile_take_screenshot`
- `mobile_get_orientation`

They use `destructiveHint: false` because the hidden setup step is additive.
Read-only tools without that side effect retain `readOnlyHint: true`.

## Tests

An MCP client connected through an in-memory transport lists the server's real
tools. A table-driven test asserts the complete annotation object for every
registered tool. This detects missing tools, omitted open-world classifications,
and regressions in remote-device or read-only metadata.

---
name: mobile-automation
description: Control Android and iOS devices, emulators and simulators — launch apps, tap, swipe, type, take screenshots, read the accessibility tree. Use when a task involves a mobile device or app, mobile UI testing, or reproducing a bug on a phone.
metadata:
  openclaw:
    requires:
      bins:
        - npx
---

# Mobile Automation with Mobile MCP

Tools for driving real phones, emulators and simulators. All tools are
prefixed `mobile_`.

## Workflow

1. **Pick a device.** Call `mobile_list_available_devices` and use one of the
   returned devices for every subsequent call. If no device is available, ask
   the user to connect one (Android: `adb devices` must show it; iOS:
   simulator booted or device paired).
2. **See the screen.** Prefer `mobile_list_elements_on_screen` — it returns
   the accessibility tree with element labels and coordinates. It is faster,
   cheaper, and more reliable than screenshots. Fall back to
   `mobile_take_screenshot` only when elements are missing or you need visual
   confirmation (games, canvas-drawn UI, image content).
3. **Act.** `mobile_click_on_screen_at_coordinates`, `mobile_swipe_on_screen`,
   `mobile_type_keys`, `mobile_press_button` (HOME, BACK, VOLUME, ENTER),
   `mobile_launch_app` / `mobile_terminate_app` / `mobile_list_apps`,
   `mobile_open_url`.
4. **Verify after every action.** Re-list elements (or re-screenshot) to
   confirm the UI changed as expected before the next step. Mobile UIs
   animate; if the expected element is not there yet, wait briefly and check
   again rather than tapping blind.

## Tips

- Click the **center** of an element's bounds, not its top-left corner.
- To type, first tap the input field, confirm it is focused, then
  `mobile_type_keys`.
- Use `mobile_save_screenshot` when the user wants the image as a file;
  `mobile_start_screen_recording` / `mobile_stop_screen_recording` for videos.
- App crashed? `mobile_list_crashes` and `mobile_get_crash` fetch crash logs.
- Screen size from `mobile_get_screen_size`; coordinates are in that space.
- Real devices in the cloud (no local hardware): `mobile_login_to_cloud_provider`,
  then `mobile_list_remote_devices` / `mobile_allocate_remote_device`, and
  release with `mobile_release_remote_device` when done. See
  https://mobilenext.ai/docs for details.

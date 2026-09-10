---
name: Gemini model availability
description: Gemini API model-list behavior for SafeNest's direct API integration.
---

The Gemini model list can include a model that returns `404 NOT_FOUND` for a specific key because that model is no longer available to new users. Treat the provider's error message as authoritative and choose an available replacement rather than assuming the model-list entry guarantees generation access.

**Why:** The first configured generation model was listed by the API but rejected at generation time with a new-user availability error.

**How to apply:** Keep the model name centralized, log the selected model without logging credentials, and verify a real `generateContent` request after provider or secret changes.
#!/bin/sh
curl -s -X POST "$CRON_ENDPOINT" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json"

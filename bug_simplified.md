# Bug: Possible gap in event emission for `servicenow.itsm.records`

## Summary
In some runs, records created between polls are not emitted by the `servicenow.itsm.records` event source. This appears when the source sleeps between polls: a record created during the sleep window is sometimes never delivered as an event on subsequent polls.

We reproduced this both in AAP and by running `ansible-rulebook` on a development machine. Reducing the poll interval to 1 second reduces the misses but does not eliminate them.

## Environment
- AAP 2.5 on RHEL 9 (single-node container)
- Ansible Rulebook 1.1.7, Python 3.11.13, Java 17.0.16
- Collections: `ansible.eda 2.9.0`, `servicenow.itsm 2.12.0`
- Table tested: `sc_request` (likely reproducible on other tables)

## Steps to reproduce (minimal)
1) Rulebook with a short interval and no `updated_since`:
```yaml
# rulebook.yml
---
- name: Respond to ServiceNow catalog request items
  hosts: all
  sources:
    - name: Watch REQs
      servicenow.itsm.records:
        table: sc_request
        interval: 10
  rules:
    - name: debug
      condition: event.meta is defined
      action:
        debug:
```
2) Start the activation and watch logs. Note two consecutive lines of the form:  
   `Polling for new records ... since <timestamp>` – call the timestamps LOWER and UPPER.  
3) While the source is sleeping, create a new `sc_request`.  
4) Confirm the record's `sys_updated_on` is between LOWER and UPPER (ServiceNow is second-precision).  
5) Observe that no event is emitted for that record on later polls.

## Example evidence
```
2025-09-09 09:43:18 - INFO - Polling for new records in sc_request since 2025-09-09 09:43:17 < (LOWER comes from here)
2025-09-09 09:43:19 - INFO - Sleeping for 10 seconds
2025-09-09 09:43:29 - INFO - Polling for new records in sc_request since 2025-09-09 09:43:28 < (UPPER comes from here)

# ServiceNow shows a row inside the gap:
REQ0010016    2025-09-09 09:43:19
```

## Impact
Potential silent data loss: rows created during the sleep window may never produce an event.

## Suspected cause
- The next poll's lower-bound timestamp (`updated_since`) may be advanced to a time in the future relative to the current fetch (e.g., `now + interval`). This would create a blind spot between the fetch and that future bound.
- ServiceNow timestamps are second-precision; if comparisons are performed with microsecond precision on the client side, edge rows on the boundary may be excluded.

## Workarounds observed
- Lowering the interval (e.g., to 1s) narrows the window and reduces misses, but does not fully address the underlying behavior.
- Starting with an `updated_since` set slightly in the past can backfill, at the cost of possible duplicates.

## ADDITIONAL OBSERVATIONS
- The behavior is reproducible **outside** AAP by running `ansible-rulebook` directly on a development environment; results are identical.


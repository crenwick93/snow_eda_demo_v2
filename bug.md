##### SUMMARY
<!--- Explain the problem briefly below -->
`servicenow.itsm.records` (EDA event source) advances its internal `updated_since` watermark to a **future time** (`now + interval`) at the start of each poll. This creates a blind spot on **every** cycle: records created/updated after the fetch in cycle *k* and before the future watermark used in cycle *k+1* are **skipped forever** (silent data loss).

##### ISSUE TYPE
- Bug Report

##### COMPONENT NAME
<!--- Write the short name of the module, plugin, task or feature below, use your best guess if unsure -->
`servicenow.itsm.records` (EDA event source) — file: `extensions/eda/plugins/event_source/records.py` (see commit `50dabcb3ff6882ba308f677076e18c0a8ad247fa`)

##### ANSIBLE VERSION
<!--- Paste verbatim output from "ansible --version" between quotes -->
```paste below
<do be completed>
```

##### COLLECTION VERSION
<!--- Paste verbatim output from "ansible-galaxy collection list <namespace>.<collection>"  between the quotes
for example: ansible-galaxy collection list community.general
-->
```paste below
ansible.eda     2.9.0
servicenow.itsm 2.12.0
```

##### CONFIGURATION
<!--- Paste verbatim output from "ansible-config dump --only-changed" between quotes -->
```paste below
<do be completed>
```

##### OS / ENVIRONMENT
<!--- Provide all relevant information below, e.g. target OS versions, network device firmware, etc. -->
AAP 2.5 running RHEL 9 single node containerised. Ansible Rulebook **1.1.7**, Python **3.11.13**, Java **17.0.16**.

##### STEPS TO REPRODUCE
<!--- Describe exactly how to reproduce the problem, using a minimal test-case -->
1. Create a minimal rulebook that watches `sc_request` with a short interval and **no** `updated_since` set (starts “from now”).  
2. Start the activation and tail EDA worker logs. Note the **two consecutive** “Polling for new records … since …” timestamps (call them `LOWER` and `UPPER`).  
3. After a poll begins (while the source sleeps), create a new `sc_request`.  
4. Use the **curl** below to verify the record’s `sys_updated_on` falls **between** the two poll timestamps (`LOWER <= ts < UPPER`). Replace the placeholders with the two times you observed in logs.  
5. Observe that no event is ever emitted for that record on subsequent polls.

<!--- Paste example playbooks or commands between quotes below -->
```yaml
# Minimal rulebook
---
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

```bash
# HOW TO PICK LOWER and UPPER FROM LOGS (example)
# Example log snippet with two consecutive polls:
# 2025-09-09 11:05:26,317 - INFO - Polling for new records in sc_request since 2025-09-09 11:05:26.313758   ← LOWER comes from here
# 2025-09-09 11:05:27,124 - INFO - Sleeping for 10 seconds
# ...
# 2025-09-09 11:05:46,336 - INFO - Polling for new records in sc_request since 2025-09-09 11:05:36.313812   ← UPPER comes from here
#
# DROP microseconds when querying ServiceNow (it is second-precision):
# LOWER -> 2025-09-09 11:05:26
# UPPER -> 2025-09-09 11:05:36

# Verify the record sits between the two poll "since" timestamps.
# Replace LOWER/UPPER with the exact timestamps from your logs (URL-encoded space: %20)
LOWER="YYYY-MM-DD%20HH:MM:SS"
UPPER="YYYY-MM-DD%20HH:MM:SS"

curl -s -u "$SN_USER:$SN_PASS"   "$SN_URL/api/now/table/sc_request?sysparm_display_value=false&sysparm_fields=sys_id,number,sys_created_on,sys_updated_on&sysparm_limit=200&sysparm_query=sys_updated_on>=$LOWER^sys_updated_on<$UPPER^ORDERBYsys_updated_on" | jq -r '.result[] | [.number, .sys_updated_on, .sys_created_on, .sys_id] | @tsv'
```

##### EXPECTED RESULTS
<!--- Describe what you expected to happen when running the steps above -->
Records created after poll *k* and before poll *k+1* should be emitted on poll *k+1*. No records should be silently skipped.

##### ACTUAL RESULTS
<!--- Describe what actually happened. If possible run with extra verbosity (-vvvv) -->
Records created between polls are **never** emitted because the next cycle’s `since` watermark is set to a **future** time. Example evidence below.

<!--- Paste verbatim command output between quotes -->
```paste below
# EDA logs illustrating the gap (example)
2025-09-09 09:43:18,299 - INFO - Polling for new records in sc_request since 2025-09-09 09:43:17.526240
2025-09-09 09:43:19,094 - INFO - Sleeping for 10 seconds
2025-09-09 09:43:29,104 - INFO - Polling for new records in sc_request since 2025-09-09 09:43:28.299925

# ServiceNow proof: record sits between those two polls (example)
REQ0010016    2025-09-09 09:43:19    2025-09-09 09:43:19    ed0ffaf653f36210a33138f0a0490edb
```

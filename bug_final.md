# Bug: `servicenow.itsm.records` future `updated_since` causes missed events

## Summary
The `servicenow.itsm.records` event source advances its `updated_since` to a future time (`now + interval`) at the start of each poll. This creates a blind spot: rows created after the current fetch but before that future timestamp are skipped by the next poll and never emitted.

Terminology: here, "watermark" means the `updated_since` lower-bound timestamp used for the next poll. Records with `sys_updated_on >= watermark` are considered; older ones are ignored.

## Component
- Plugin: `servicenow.itsm.records` (EDA event source)  
- File: `extensions/eda/plugins/event_source/records.py`  
- Commit observed: `50dabcb3ff6882ba308f677076e18c0a8ad247fa`

## Versions
**ansible --version**
```
ansible [core 2.16.14]
config file = /etc/ansible/ansible.cfg
configured module search path = ['/home/runner/.ansible/plugins/modules', '/usr/share/ansible/plugins/modules']
ansible python module location = /usr/lib/python3.11/site-packages/ansible
ansible collection location = /home/runner/.ansible/collections:/usr/share/ansible/collections
executable location = /usr/bin/ansible
python version = 3.11.13 (main, Aug 21 2025, 11:45:17) [GCC 8.5.0 20210514 (Red Hat 8.5.0-28)] (/usr/bin/python3.11)
jinja version = 3.1.6
libyaml = True
```

**collections**
```
ansible.eda     2.9.0
servicenow.itsm 2.12.0
```

**ansible-config (Decision Environment)**
```
CONFIG_FILE() = /etc/ansible/ansible.cfg
```

## Environment
AAP 2.5 on RHEL 9, single-node container. Ansible Rulebook 1.1.7, Python 3.11.13, Java 17.0.16.

## Steps to reproduce
1) Use a minimal rulebook that watches `sc_request` with a short interval and no `updated_since`:
```yaml
# rulebook.yml
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
2) Start the activation and watch logs. Note two consecutive "Polling for new records ... since ..." lines; call their timestamps LOWER and UPPER.  
3) While the source is sleeping, create a new `sc_request`.  
4) Verify the new row's `sys_updated_on` is between LOWER and UPPER.  
5) Observe that no event is emitted for that row on subsequent polls.

**Finding LOWER/UPPER example**
```
2025-09-09 11:05:26,317 - INFO - Polling for new records in sc_request since 2025-09-09 11:05:26.313758  (LOWER)
2025-09-09 11:05:27,124 - INFO - Sleeping for 10 seconds
...
2025-09-09 11:05:46,336 - INFO - Polling for new records in sc_request since 2025-09-09 11:05:36.313812  (UPPER)

# ServiceNow uses second precision; drop microseconds when querying.
# LOWER -> 2025-09-09 11:05:26
# UPPER -> 2025-09-09 11:05:36
```

**Query to confirm the row is between LOWER and UPPER**
```bash
LOWER="YYYY-MM-DD%20HH:MM:SS"
UPPER="YYYY-MM-DD%20HH:MM:SS"

curl -s -u "$SN_USER:$SN_PASS" \
  "$SN_URL/api/now/table/sc_request?sysparm_display_value=false&sysparm_fields=sys_id,number,sys_created_on,sys_updated_on&sysparm_limit=200&sysparm_query=sys_updated_on>=$LOWER^sys_updated_on<$UPPER^ORDERBYsys_updated_on" \
  | jq -r '.result[] | [.number, .sys_updated_on, .sys_created_on, .sys_id] | @tsv'
```

## Expected result
Rows created after the previous poll's fetch (i.e., between two consecutive "Polling ... since ..." timestamps) are emitted on the next poll. No silent skips.

## Actual result
Rows created during the sleep window are not emitted because the next cycle's lower bound is set in the future.

**Example**
```
2025-09-09 09:43:18,299 - INFO - Polling for new records in sc_request since 2025-09-09 09:43:17.526240
2025-09-09 09:43:19,094 - INFO - Sleeping for 10 seconds
2025-09-09 09:43:29,104 - INFO - Polling for new records in sc_request since 2025-09-09 09:43:28.299925

# ServiceNow shows a row in the gap:
REQ0010016    2025-09-09 09:43:19    2025-09-09 09:43:19    ed0ffaf653f36210a33138f0a0490edb
```

## Additional observations
- The behavior also reproduces outside AAP by running `ansible-rulebook` directly on a development machine.
- Reducing the interval to 1 second tends to pick up more events because the sleep window is smaller, but the underlying skip still occurs when the watermark is set to a future time.

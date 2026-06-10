#!/bin/bash

set -euo pipefail

start_opnsense_vm() {
  local vm_name="${OPNSENSE_VM_NAME:-opnsense}"
  local libvirt_uri="${LIBVIRT_URI:-qemu:///system}"

  if ! command -v virsh >/dev/null 2>&1; then
    echo "virsh not found, skipping startup"
    return 0
  fi

  if ! sudo -n virsh --connect "$libvirt_uri" dominfo "$vm_name" >/dev/null 2>&1; then
    echo "OPNsense VM '$vm_name' ism't installed, skipping startup"
    return 0
  fi

  if sudo -n virsh --connect "$libvirt_uri" domstate "$vm_name" 2>/dev/null | grep -qi running; then
    echo "OPNsense VM '$vm_name' is already running"
    return 0
  fi

  echo "Starting OPNsense VM '$vm_name' :D"
  sudo -n virsh --connect "$libvirt_uri" start "$vm_name" >/dev/null 2>&1 || true
}

start_opnsense_vm
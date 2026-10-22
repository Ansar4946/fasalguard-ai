#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 (arm64) Oracle Cloud VM. Run as a sudo-capable user:
#   sudo bash bootstrap-vm.sh [--deploy-user deploy] [--ssh-pubkey-file path] [--fail2ban]
# Installs Docker Engine + compose plugin (Docker's official apt repo), a 4 GB swapfile, an iptables firewall
# (22/80/443 only), unattended security upgrades and a non-root deploy user.
set -euo pipefail

deploy_user="deploy"
pubkey_file=""
want_fail2ban=0
swap_size_gb=4

while [ "$#" -gt 0 ]; do
  case "$1" in
    --deploy-user) deploy_user="${2:-}"; shift 2 ;;
    --ssh-pubkey-file) pubkey_file="${2:-}"; shift 2 ;;
    --fail2ban) want_fail2ban=1; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

[ "$(id -u)" -eq 0 ] || { echo "Run with sudo." >&2; exit 1; }
# shellcheck disable=SC1091
. /etc/os-release
[ "${ID:-}" = "ubuntu" ] || { echo "This script targets Ubuntu (found ${ID:-unknown})." >&2; exit 1; }
arch="$(dpkg --print-architecture)"
if [ "$arch" != "arm64" ]; then echo "WARNING: architecture is $arch (kit is written for arm64 but also works on amd64)."; fi

export DEBIAN_FRONTEND=noninteractive

echo "==> apt update/upgrade"
apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl gnupg unattended-upgrades git rsync openssl

echo "==> Docker Engine from Docker's official repository"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$arch signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" \
    >/etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker
# Keep container logs from filling the disk.
if [ ! -f /etc/docker/daemon.json ]; then
  printf '%s\n' '{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }' >/etc/docker/daemon.json
  systemctl restart docker
fi

echo "==> ${swap_size_gb} GB swapfile"
if ! swapon --show=NAME --noheadings | grep -q '^/swapfile$'; then
  if [ ! -f /swapfile ]; then
    fallocate -l "${swap_size_gb}G" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=$((swap_size_gb * 1024))
    chmod 600 /swapfile
    mkswap /swapfile
  fi
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi
sysctl -w vm.swappiness=10 >/dev/null
echo 'vm.swappiness=10' >/etc/sysctl.d/99-swappiness.conf

echo "==> Deploy user: $deploy_user"
if ! id "$deploy_user" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$deploy_user"
fi
usermod -aG docker "$deploy_user"
install -d -m 700 -o "$deploy_user" -g "$deploy_user" "/home/$deploy_user/.ssh"
if [ -n "$pubkey_file" ]; then
  cat "$pubkey_file" >>"/home/$deploy_user/.ssh/authorized_keys"
elif [ -n "${SUDO_USER:-}" ] && [ -f "/home/$SUDO_USER/.ssh/authorized_keys" ]; then
  cat "/home/$SUDO_USER/.ssh/authorized_keys" >>"/home/$deploy_user/.ssh/authorized_keys"
fi
if [ -f "/home/$deploy_user/.ssh/authorized_keys" ]; then
  sort -u "/home/$deploy_user/.ssh/authorized_keys" -o "/home/$deploy_user/.ssh/authorized_keys"
  chown "$deploy_user:$deploy_user" "/home/$deploy_user/.ssh/authorized_keys"
  chmod 600 "/home/$deploy_user/.ssh/authorized_keys"
else
  echo "WARNING: no SSH key was installed for $deploy_user; add one before logging out." >&2
fi
install -d -m 750 -o "$deploy_user" -g "$deploy_user" /var/backups/fasalguard

# NOTE: ufw is NOT used. iptables-persistent (below) conflicts with ufw and apt removes it, so the
# firewall on this VM is Oracle's iptables ruleset plus the explicit ACCEPTs added here (22/80/443 only).

# Oracle's Ubuntu images ship an iptables ruleset that REJECTs everything except SSH, in addition to
# the VCN security list. Insert explicit ACCEPTs ahead of the final REJECT and persist them.
echo "==> iptables: allow 80/443 on INPUT (Oracle images reject them by default)"
for port in 80 443; do
  if ! iptables -C INPUT -p tcp --dport "$port" -m conntrack --ctstate NEW -j ACCEPT 2>/dev/null; then
    iptables -I INPUT 1 -p tcp --dport "$port" -m conntrack --ctstate NEW -j ACCEPT
  fi
done
apt-get install -y iptables-persistent netfilter-persistent
netfilter-persistent save

echo "==> Unattended security upgrades"
printf '%s\n' \
  'APT::Periodic::Update-Package-Lists "1";' \
  'APT::Periodic::Unattended-Upgrade "1";' \
  'APT::Periodic::AutocleanInterval "7";' >/etc/apt/apt.conf.d/20auto-upgrades
systemctl enable --now unattended-upgrades

if [ "$want_fail2ban" -eq 1 ]; then
  echo "==> fail2ban (SSH)"
  apt-get install -y fail2ban
  printf '%s\n' '[sshd]' 'enabled = true' 'maxretry = 5' 'findtime = 10m' 'bantime = 1h' >/etc/fail2ban/jail.d/sshd.local
  systemctl enable --now fail2ban
fi

echo
echo "Bootstrap finished."
echo "Next: log in as '$deploy_user' (new SSH session so the docker group applies), then clone/copy the repo."
echo "REMINDER: also open 80 and 443 in the Oracle VCN security list / NSG (see docs/operations/FREE_DEPLOY_ORACLE.md)."
if [ -f /var/run/reboot-required ]; then echo "A reboot is recommended: sudo reboot"; fi

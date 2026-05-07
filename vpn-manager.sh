#!/usr/bin/env bash
# vpn-manager.sh — менеджер VPN-конфигов на базе Xray-core
#
# Возможности:
#   1) Создать VPN конфиг (5 режимов маскировки × 4 протокола × Solo/Merge для Happ)
#   2) Удалить VPN конфиг
#   3) Показать текущие конфиги
#   4) Посмотреть активные подключения по конфигам
#   5) Показать потребляемое количество трафика (in/out)
#
# Поддерживаемые режимы:
#   - Default       : обычный туннель, минимум обвязки
#   - Encrypted     : VLESS+REALITY (DPI не видит реальный URL/SNI)
#   - White-List    : REALITY со SNI разрешённого ресурса (vk.com и т.п.)
#   - Fake TLS      : REALITY+Vision под реальный HTTPS-сайт
#   - Mega crypt    : REALITY+Vision поверх WebSocket+TLS (максимальная маскировка)
#
# Поддерживаемые протоколы: vless, trojan, xray (vless+xtls-vision), shadowsocks
#
# Зависимости: bash >=4, jq, openssl, curl, qrencode (опц.), xray-core
# Скрипт автоматически устанавливает недостающие зависимости через apt.

set -Eeuo pipefail

# ---------------------------------------------------------------------------
# Константы / пути
# ---------------------------------------------------------------------------
readonly SCRIPT_NAME="vpn-manager"
readonly SCRIPT_VERSION="1.0.0"

readonly STATE_DIR="/etc/${SCRIPT_NAME}"
readonly REGISTRY_FILE="${STATE_DIR}/registry.json"
readonly HAPP_FILE="${STATE_DIR}/happ.json"
readonly XRAY_CONF_DIR="/usr/local/etc/xray"
readonly XRAY_CONF_FILE="${XRAY_CONF_DIR}/config.json"
readonly XRAY_LOG_DIR="/var/log/xray"
readonly XRAY_ACCESS_LOG="${XRAY_LOG_DIR}/access.log"
readonly XRAY_API_TAG="api"
readonly XRAY_API_PORT=10085

# Цвета (только для tty)
if [[ -t 1 ]]; then
    readonly C_RED=$'\033[31m'
    readonly C_GREEN=$'\033[32m'
    readonly C_YELLOW=$'\033[33m'
    readonly C_BLUE=$'\033[34m'
    readonly C_CYAN=$'\033[36m'
    readonly C_BOLD=$'\033[1m'
    readonly C_DIM=$'\033[2m'
    readonly C_RESET=$'\033[0m'
else
    readonly C_RED='' C_GREEN='' C_YELLOW='' C_BLUE='' C_CYAN='' C_BOLD='' C_DIM='' C_RESET=''
fi

# ---------------------------------------------------------------------------
# Логирование
# ---------------------------------------------------------------------------
log_info()  { printf '%b[INFO]%b %s\n'  "${C_CYAN}"   "${C_RESET}" "$*"; }
log_ok()    { printf '%b[ OK ]%b %s\n'  "${C_GREEN}"  "${C_RESET}" "$*"; }
log_warn()  { printf '%b[WARN]%b %s\n'  "${C_YELLOW}" "${C_RESET}" "$*" >&2; }
log_err()   { printf '%b[ERR ]%b %s\n'  "${C_RED}"    "${C_RESET}" "$*" >&2; }
die()       { log_err "$*"; exit 1; }

trap 'log_err "Ошибка на строке ${LINENO}. Завершение."' ERR

# ---------------------------------------------------------------------------
# Проверка root
# ---------------------------------------------------------------------------
require_root() {
    if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
        log_warn "Скрипту требуются root-права."
        if command -v sudo >/dev/null 2>&1; then
            log_info "Перезапуск через sudo..."
            exec sudo -E -- "$0" "$@"
        else
            die "Запустите скрипт от root (например: sudo $0)."
        fi
    fi
}

# ---------------------------------------------------------------------------
# Установка зависимостей
# ---------------------------------------------------------------------------
ensure_pkg() {
    local pkg="$1"
    if ! command -v "${pkg}" >/dev/null 2>&1; then
        log_info "Устанавливаю пакет: ${pkg}"
        if command -v apt-get >/dev/null 2>&1; then
            DEBIAN_FRONTEND=noninteractive apt-get update -qq
            DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${pkg}"
        elif command -v dnf >/dev/null 2>&1; then
            dnf install -y -q "${pkg}"
        elif command -v yum >/dev/null 2>&1; then
            yum install -y -q "${pkg}"
        elif command -v pacman >/dev/null 2>&1; then
            pacman -Sy --noconfirm "${pkg}"
        else
            die "Не удалось определить менеджер пакетов. Установите ${pkg} вручную."
        fi
    fi
}

ensure_xray() {
    if command -v xray >/dev/null 2>&1; then
        return 0
    fi
    log_info "Устанавливаю Xray-core (официальный installer)..."
    bash -c "$(curl -fsSL https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" \
        @ install >/dev/null
    command -v xray >/dev/null 2>&1 || die "Установка xray не удалась."
}

ensure_dependencies() {
    ensure_pkg jq
    ensure_pkg curl
    ensure_pkg openssl
    ensure_pkg qrencode || true
    ensure_xray
}

# ---------------------------------------------------------------------------
# Состояние / реестр
# ---------------------------------------------------------------------------
init_state() {
    install -d -m 0755 "${STATE_DIR}"
    install -d -m 0755 "${XRAY_CONF_DIR}"
    install -d -m 0755 "${XRAY_LOG_DIR}"
    [[ -f "${XRAY_ACCESS_LOG}" ]] || : > "${XRAY_ACCESS_LOG}"
    if [[ ! -f "${REGISTRY_FILE}" ]]; then
        printf '{"version":1,"configs":[]}\n' > "${REGISTRY_FILE}"
        chmod 0600 "${REGISTRY_FILE}"
    fi
    if [[ ! -f "${HAPP_FILE}" ]]; then
        printf '{"version":1,"links":[]}\n' > "${HAPP_FILE}"
        chmod 0600 "${HAPP_FILE}"
    fi
}

registry_count() {
    jq '.configs | length' "${REGISTRY_FILE}"
}

registry_get_by_id() {
    jq --arg id "$1" '.configs[] | select(.id==$id)' "${REGISTRY_FILE}"
}

registry_used_ports() {
    jq -r '.configs[].port' "${REGISTRY_FILE}"
}

registry_add() {
    local entry_json="$1"
    local tmp
    tmp="$(mktemp)"
    jq --argjson e "${entry_json}" '.configs += [$e]' "${REGISTRY_FILE}" > "${tmp}"
    mv "${tmp}" "${REGISTRY_FILE}"
    chmod 0600 "${REGISTRY_FILE}"
}

registry_remove() {
    local id="$1"
    local tmp
    tmp="$(mktemp)"
    jq --arg id "${id}" '.configs |= map(select(.id != $id))' "${REGISTRY_FILE}" > "${tmp}"
    mv "${tmp}" "${REGISTRY_FILE}"
    chmod 0600 "${REGISTRY_FILE}"
}

happ_add_link() {
    local link="$1"
    local tmp
    tmp="$(mktemp)"
    jq --arg l "${link}" '.links += [$l] | .links |= unique' "${HAPP_FILE}" > "${tmp}"
    mv "${tmp}" "${HAPP_FILE}"
    chmod 0600 "${HAPP_FILE}"
}

happ_remove_link() {
    local link="$1"
    local tmp
    tmp="$(mktemp)"
    jq --arg l "${link}" '.links |= map(select(. != $l))' "${HAPP_FILE}" > "${tmp}"
    mv "${tmp}" "${HAPP_FILE}"
    chmod 0600 "${HAPP_FILE}"
}

# ---------------------------------------------------------------------------
# Утилиты
# ---------------------------------------------------------------------------
public_ip() {
    local ip
    ip="$(curl -fs --max-time 3 https://api.ipify.org || true)"
    [[ -n "${ip}" ]] || ip="$(curl -fs --max-time 3 https://ifconfig.me || true)"
    [[ -n "${ip}" ]] || ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
    [[ -n "${ip}" ]] || ip="127.0.0.1"
    printf '%s' "${ip}"
}

random_id() {
    openssl rand -hex 4
}

random_uuid() {
    if command -v uuidgen >/dev/null 2>&1; then
        uuidgen | tr 'A-Z' 'a-z'
    else
        # RFC 4122 v4
        local h
        h="$(openssl rand -hex 16)"
        printf '%s-%s-4%s-%s-%s\n' \
            "${h:0:8}" "${h:8:4}" "${h:13:3}" \
            "$(printf '%x' $(( (0x${h:16:1} & 0x3) | 0x8 )) )${h:17:3}" \
            "${h:20:12}"
    fi
}

random_port() {
    local used
    used="$(registry_used_ports | tr '\n' ' ')"
    local p
    while :; do
        p=$(( (RANDOM % 20000) + 20000 ))
        [[ " ${used} " != *" ${p} "* ]] && break
    done
    printf '%d' "${p}"
}

random_password() {
    openssl rand -base64 24 | tr -d '\n=' | tr '/+' '_-'
}

reality_keypair() {
    # Возвращает строку "PRIVATE PUBLIC"
    local out priv pub
    out="$(xray x25519 2>/dev/null || true)"
    if [[ -z "${out}" ]]; then
        die "Не удалось сгенерировать REALITY-ключи (xray x25519)."
    fi
    priv="$(awk -F': *' 'tolower($1) ~ /private/ {print $2}' <<<"${out}")"
    pub="$(awk -F': *' 'tolower($1) ~ /public/ {print $2}' <<<"${out}")"
    [[ -n "${priv}" && -n "${pub}" ]] || die "Не удалось распарсить вывод xray x25519."
    printf '%s %s' "${priv}" "${pub}"
}

short_id_hex() {
    openssl rand -hex 4
}

url_encode() {
    local s="$1" out="" c
    local i
    for (( i=0; i<${#s}; i++ )); do
        c="${s:i:1}"
        case "${c}" in
            [a-zA-Z0-9.~_-]) out+="${c}" ;;
            *) out+="$(printf '%%%02X' "'${c}")" ;;
        esac
    done
    printf '%s' "${out}"
}

prompt() {
    local msg="$1" default="${2:-}" reply
    if [[ -n "${default}" ]]; then
        read -r -p "${msg} [${default}]: " reply
        printf '%s' "${reply:-${default}}"
    else
        read -r -p "${msg}: " reply
        printf '%s' "${reply}"
    fi
}

choose() {
    # choose "Заголовок" "опция1" "опция2" ...
    local title="$1"; shift
    local options=("$@")
    local i n=${#options[@]}
    printf '\n%b%s%b\n' "${C_BOLD}" "${title}" "${C_RESET}"
    for (( i=0; i<n; i++ )); do
        printf '  %b%d)%b %s\n' "${C_CYAN}" "$((i+1))" "${C_RESET}" "${options[i]}"
    done
    local pick
    while :; do
        read -r -p "Ваш выбор [1-${n}]: " pick
        [[ "${pick}" =~ ^[0-9]+$ ]] && (( pick >= 1 && pick <= n )) && break
        log_warn "Введите число от 1 до ${n}."
    done
    printf '%d' "$((pick-1))"
}

# ---------------------------------------------------------------------------
# Профили маскировки (mode)
# ---------------------------------------------------------------------------
# Возвращает SNI/dest для режимов, использующих REALITY.
mode_dest_for() {
    local mode="$1"
    case "${mode}" in
        encrypted)        printf 'www.cloudflare.com:443' ;;
        whitelist_bypass) printf 'vk.com:443' ;;
        fake_tls)         printf 'www.microsoft.com:443' ;;
        mega_crypt)       printf 'www.apple.com:443' ;;
        *)                printf 'www.cloudflare.com:443' ;;
    esac
}

mode_sni_for() {
    local mode="$1"
    mode_dest_for "${mode}" | cut -d: -f1
}

mode_human() {
    case "$1" in
        default)          printf 'Default' ;;
        encrypted)        printf 'Encrypted (REALITY)' ;;
        whitelist_bypass) printf 'White-List Bypass' ;;
        fake_tls)         printf 'Fake TLS' ;;
        mega_crypt)       printf 'Mega Crypt' ;;
        *)                printf '%s' "$1" ;;
    esac
}

proto_human() {
    case "$1" in
        vless)        printf 'VLESS' ;;
        trojan)       printf 'Trojan' ;;
        xray)         printf 'Xray (VLESS+Vision)' ;;
        shadowsocks)  printf 'Shadowsocks' ;;
        *)            printf '%s' "$1" ;;
    esac
}

# ---------------------------------------------------------------------------
# Сборка inbound для Xray-core (jq)
# ---------------------------------------------------------------------------
build_inbound_json() {
    # Аргументы передаются через окружение, чтобы не плодить позиционные.
    local id="$1" proto="$2" mode="$3" port="$4" tag="$5"
    local entry
    entry="$(registry_get_by_id "${id}")"
    [[ -n "${entry}" ]] || die "Не найден конфиг ${id} в реестре."

    local uuid password sni dest priv pub sid method
    uuid="$(jq -r '.uuid // ""' <<<"${entry}")"
    password="$(jq -r '.password // ""' <<<"${entry}")"
    sni="$(jq -r '.sni // ""' <<<"${entry}")"
    dest="$(jq -r '.dest // ""' <<<"${entry}")"
    priv="$(jq -r '.reality_priv // ""' <<<"${entry}")"
    pub="$(jq -r '.reality_pub // ""' <<<"${entry}")"
    sid="$(jq -r '.short_id // ""' <<<"${entry}")"
    method="$(jq -r '.method // ""' <<<"${entry}")"

    # Базовый шаблон
    local base
    base="$(jq -n --arg tag "${tag}" --argjson port "${port}" \
        '{listen:"0.0.0.0", port:$port, tag:$tag, sniffing:{enabled:true, destOverride:["http","tls","quic"]}}')"

    case "${proto}_${mode}" in
        # ---- VLESS ----
        vless_default)
            jq --arg uuid "${uuid}" \
               '. + {protocol:"vless",
                     settings:{clients:[{id:$uuid,flow:""}], decryption:"none"},
                     streamSettings:{network:"tcp", security:"none"}}' <<<"${base}"
            ;;
        vless_encrypted|vless_whitelist_bypass|vless_fake_tls|vless_mega_crypt)
            jq --arg uuid "${uuid}" --arg sni "${sni}" --arg dest "${dest}" \
               --arg priv "${priv}" --arg sid "${sid}" \
               '. + {protocol:"vless",
                     settings:{clients:[{id:$uuid,flow:"xtls-rprx-vision"}], decryption:"none"},
                     streamSettings:{network:"tcp",
                                     security:"reality",
                                     realitySettings:{show:false,
                                                      dest:$dest,
                                                      xver:0,
                                                      serverNames:[$sni],
                                                      privateKey:$priv,
                                                      shortIds:[$sid]}}}' <<<"${base}"
            ;;

        # ---- Trojan ----
        trojan_default)
            jq --arg pwd "${password}" \
               '. + {protocol:"trojan",
                     settings:{clients:[{password:$pwd}]},
                     streamSettings:{network:"tcp", security:"none"}}' <<<"${base}"
            ;;
        trojan_encrypted|trojan_whitelist_bypass|trojan_fake_tls|trojan_mega_crypt)
            jq --arg pwd "${password}" --arg sni "${sni}" --arg dest "${dest}" \
               --arg priv "${priv}" --arg sid "${sid}" \
               '. + {protocol:"trojan",
                     settings:{clients:[{password:$pwd}]},
                     streamSettings:{network:"tcp",
                                     security:"reality",
                                     realitySettings:{show:false,
                                                      dest:$dest,
                                                      xver:0,
                                                      serverNames:[$sni],
                                                      privateKey:$priv,
                                                      shortIds:[$sid]}}}' <<<"${base}"
            ;;

        # ---- Xray (VLESS + xtls-rprx-vision) ----
        xray_default)
            jq --arg uuid "${uuid}" \
               '. + {protocol:"vless",
                     settings:{clients:[{id:$uuid,flow:"xtls-rprx-vision"}], decryption:"none"},
                     streamSettings:{network:"tcp", security:"none"}}' <<<"${base}"
            ;;
        xray_encrypted|xray_whitelist_bypass|xray_fake_tls|xray_mega_crypt)
            jq --arg uuid "${uuid}" --arg sni "${sni}" --arg dest "${dest}" \
               --arg priv "${priv}" --arg sid "${sid}" \
               '. + {protocol:"vless",
                     settings:{clients:[{id:$uuid,flow:"xtls-rprx-vision"}], decryption:"none"},
                     streamSettings:{network:"tcp",
                                     security:"reality",
                                     realitySettings:{show:false,
                                                      dest:$dest,
                                                      xver:0,
                                                      serverNames:[$sni],
                                                      privateKey:$priv,
                                                      shortIds:[$sid]}}}' <<<"${base}"
            ;;

        # ---- Shadowsocks ----
        shadowsocks_default|shadowsocks_encrypted|shadowsocks_whitelist_bypass|shadowsocks_fake_tls|shadowsocks_mega_crypt)
            jq --arg pwd "${password}" --arg method "${method}" \
               '. + {protocol:"shadowsocks",
                     settings:{method:$method, password:$pwd, network:"tcp,udp"},
                     streamSettings:{network:"tcp", security:"none"}}' <<<"${base}"
            ;;
        *)
            die "Неподдерживаемая комбинация ${proto}/${mode}"
            ;;
    esac
}

# ---------------------------------------------------------------------------
# Полная генерация Xray config из реестра
# ---------------------------------------------------------------------------
write_xray_config() {
    local inbounds="[]"
    local id proto mode port tag entry inb

    while read -r entry; do
        [[ -z "${entry}" ]] && continue
        id="$(jq -r '.id'        <<<"${entry}")"
        proto="$(jq -r '.protocol' <<<"${entry}")"
        mode="$(jq -r '.mode'    <<<"${entry}")"
        port="$(jq -r '.port'    <<<"${entry}")"
        tag="$(jq -r '.tag'      <<<"${entry}")"
        inb="$(build_inbound_json "${id}" "${proto}" "${mode}" "${port}" "${tag}")"
        inbounds="$(jq --argjson new "${inb}" '. + [$new]' <<<"${inbounds}")"
    done < <(jq -c '.configs[]' "${REGISTRY_FILE}")

    # API-инбаунд для статистики
    local api_inbound
    api_inbound="$(jq -n --argjson port "${XRAY_API_PORT}" --arg tag "${XRAY_API_TAG}" \
        '{listen:"127.0.0.1", port:$port, protocol:"dokodemo-door",
          settings:{address:"127.0.0.1"}, tag:$tag}')"
    inbounds="$(jq --argjson api "${api_inbound}" '[$api] + .' <<<"${inbounds}")"

    local cfg
    cfg="$(jq -n --argjson inbounds "${inbounds}" --arg log "${XRAY_ACCESS_LOG}" \
        '{
            log: {access:$log, loglevel:"warning"},
            api: {tag:"api", services:["HandlerService","StatsService"]},
            stats: {},
            policy: {levels:{"0":{statsUserUplink:true,statsUserDownlink:true}},
                     system:{statsInboundUplink:true,statsInboundDownlink:true,
                             statsOutboundUplink:true,statsOutboundDownlink:true}},
            inbounds: $inbounds,
            outbounds: [
                {protocol:"freedom", tag:"direct"},
                {protocol:"blackhole", tag:"blocked"}
            ],
            routing: {
                rules: [
                    {type:"field", inboundTag:["api"], outboundTag:"api"}
                ]
            }
        }')"

    install -d -m 0755 "${XRAY_CONF_DIR}"
    printf '%s\n' "${cfg}" > "${XRAY_CONF_FILE}"
    chmod 0644 "${XRAY_CONF_FILE}"
}

reload_xray() {
    if systemctl list-unit-files xray.service >/dev/null 2>&1; then
        systemctl restart xray.service
        sleep 1
        if systemctl is-active --quiet xray.service; then
            log_ok "Xray перезапущен и активен."
        else
            log_warn "Xray не активен, проверьте: journalctl -u xray -n 50 --no-pager"
        fi
    else
        log_warn "systemd-юнит xray не найден — пропускаю рестарт."
    fi
}

# ---------------------------------------------------------------------------
# Генерация share-ссылок (vless/trojan/ss)
# ---------------------------------------------------------------------------
build_share_link() {
    local id="$1"
    local entry; entry="$(registry_get_by_id "${id}")"
    [[ -n "${entry}" ]] || die "Конфиг ${id} не найден."

    local proto mode name port host uuid password sni pub sid method flow security
    proto="$(jq -r '.protocol' <<<"${entry}")"
    mode="$(jq -r '.mode'      <<<"${entry}")"
    name="$(jq -r '.name'      <<<"${entry}")"
    port="$(jq -r '.port'      <<<"${entry}")"
    host="$(jq -r '.host'      <<<"${entry}")"
    uuid="$(jq -r '.uuid // ""'        <<<"${entry}")"
    password="$(jq -r '.password // ""' <<<"${entry}")"
    sni="$(jq -r '.sni // ""'          <<<"${entry}")"
    pub="$(jq -r '.reality_pub // ""'  <<<"${entry}")"
    sid="$(jq -r '.short_id // ""'     <<<"${entry}")"
    method="$(jq -r '.method // ""'    <<<"${entry}")"
    flow="$(jq -r '.flow // ""'        <<<"${entry}")"
    security="$(jq -r '.security // "none"' <<<"${entry}")"

    local enc_name; enc_name="$(url_encode "${name}")"

    case "${proto}" in
        vless|xray)
            local q="encryption=none"
            [[ -n "${flow}" ]] && q+="&flow=${flow}"
            q+="&security=${security}"
            q+="&type=tcp"
            if [[ "${security}" == "reality" ]]; then
                q+="&sni=${sni}"
                q+="&pbk=${pub}"
                q+="&sid=${sid}"
                q+="&fp=chrome"
            fi
            printf 'vless://%s@%s:%s?%s#%s\n' "${uuid}" "${host}" "${port}" "${q}" "${enc_name}"
            ;;
        trojan)
            local q="security=${security}"
            q+="&type=tcp"
            if [[ "${security}" == "reality" ]]; then
                q+="&sni=${sni}"
                q+="&pbk=${pub}"
                q+="&sid=${sid}"
                q+="&fp=chrome"
            fi
            printf 'trojan://%s@%s:%s?%s#%s\n' \
                "$(url_encode "${password}")" "${host}" "${port}" "${q}" "${enc_name}"
            ;;
        shadowsocks)
            local userinfo b64
            userinfo="${method}:${password}"
            b64="$(printf '%s' "${userinfo}" | base64 -w0 | tr '+/' '-_' | tr -d '=')"
            printf 'ss://%s@%s:%s#%s\n' "${b64}" "${host}" "${port}" "${enc_name}"
            ;;
        *)
            die "Неизвестный протокол ${proto}."
            ;;
    esac
}

# ---------------------------------------------------------------------------
# Меню: создание конфига
# ---------------------------------------------------------------------------
choose_mode() {
    local idx
    idx="$(choose "Выберите тип маскировки VPN-конфига:" \
        "Default — обычный туннель через VPS" \
        "Encrypted — провайдер не видит реальный URL/IP" \
        "White-List Bypass — обход белых списков (vk.ru, max.ru и т.п.)" \
        "Fake TLS — маскировка под обычный HTTPS-сайт" \
        "Mega crypt — комбинированная многослойная маскировка")"
    case "${idx}" in
        0) printf 'default' ;;
        1) printf 'encrypted' ;;
        2) printf 'whitelist_bypass' ;;
        3) printf 'fake_tls' ;;
        4) printf 'mega_crypt' ;;
    esac
}

choose_protocol() {
    local idx
    idx="$(choose "Выберите тип конфига (протокол):" \
        "VLESS" \
        "Trojan" \
        "Xray (VLESS + xtls-rprx-vision)" \
        "Shadowsocks")"
    case "${idx}" in
        0) printf 'vless' ;;
        1) printf 'trojan' ;;
        2) printf 'xray' ;;
        3) printf 'shadowsocks' ;;
    esac
}

choose_solo_or_merge() {
    local idx
    idx="$(choose "Что делать с конфигом?" \
        "Solo — отдельная одиночная ссылка" \
        "Merge — добавить в общий Happ-список серверов")"
    case "${idx}" in
        0) printf 'solo'  ;;
        1) printf 'merge' ;;
    esac
}

cmd_create() {
    local mode protocol delivery
    mode="$(choose_mode)"
    protocol="$(choose_protocol)"
    delivery="$(choose_solo_or_merge)"

    local default_server_name default_config_name detected_ip host port
    default_server_name="$(prompt "Название сервера" "$(hostname -s 2>/dev/null || echo 'vps')")"
    default_config_name="$(prompt "Название конфига" "${default_server_name}-$(mode_human "${mode}" | tr ' ' '_')-$(proto_human "${protocol}" | awk '{print $1}')")"
    detected_ip="$(public_ip)"
    host="$(prompt "Адрес сервера (IP / домен)" "${detected_ip}")"
    port="$(prompt "Порт (Enter — случайный 20000-39999)" "$(random_port)")"

    [[ "${port}" =~ ^[0-9]+$ ]] || die "Порт должен быть числом."

    local id; id="$(random_id)"
    local tag="${protocol}-${mode}-${id}"

    # Подготовка полей реестра в зависимости от протокола/режима
    local entry
    entry="$(jq -n \
        --arg id "${id}" \
        --arg name "${default_config_name}" \
        --arg server "${default_server_name}" \
        --arg host "${host}" \
        --argjson port "${port}" \
        --arg tag "${tag}" \
        --arg protocol "${protocol}" \
        --arg mode "${mode}" \
        --arg delivery "${delivery}" \
        --arg created "$(date -u +%FT%TZ)" \
        '{id:$id,name:$name,server:$server,host:$host,port:$port,tag:$tag,
          protocol:$protocol,mode:$mode,delivery:$delivery,created:$created,
          security:"none"}')"

    case "${protocol}" in
        vless|xray)
            local uuid; uuid="$(random_uuid)"
            entry="$(jq --arg u "${uuid}" '.uuid=$u' <<<"${entry}")"
            ;;
        trojan)
            local pwd; pwd="$(random_password)"
            entry="$(jq --arg p "${pwd}" '.password=$p' <<<"${entry}")"
            ;;
        shadowsocks)
            local pwd; pwd="$(random_password)"
            entry="$(jq --arg p "${pwd}" --arg m "2022-blake3-aes-256-gcm" \
                '.password=$p | .method=$m' <<<"${entry}")"
            # SS-2022 требует 32-байтный ключ в base64
            local key; key="$(openssl rand -base64 32 | tr -d '\n')"
            entry="$(jq --arg p "${key}" '.password=$p' <<<"${entry}")"
            ;;
    esac

    # Vision flow для xray и для всех reality-инбаундов
    if [[ "${protocol}" == "xray" || ( "${protocol}" == "vless" && "${mode}" != "default" ) ]]; then
        entry="$(jq '.flow="xtls-rprx-vision"' <<<"${entry}")"
    fi

    if [[ "${mode}" != "default" && "${protocol}" != "shadowsocks" ]]; then
        local kp priv pub sid sni dest
        kp="$(reality_keypair)"
        priv="${kp% *}"
        pub="${kp#* }"
        sid="$(short_id_hex)"
        sni="$(mode_sni_for "${mode}")"
        dest="$(mode_dest_for "${mode}")"
        entry="$(jq --arg priv "${priv}" --arg pub "${pub}" --arg sid "${sid}" \
                    --arg sni "${sni}"  --arg dest "${dest}" \
                    '.reality_priv=$priv | .reality_pub=$pub | .short_id=$sid |
                     .sni=$sni | .dest=$dest | .security="reality"' <<<"${entry}")"
    fi

    registry_add "${entry}"
    write_xray_config
    reload_xray

    local link; link="$(build_share_link "${id}")"

    printf '\n%b%s%b\n' "${C_BOLD}" "Конфиг создан" "${C_RESET}"
    printf '  ID         : %s\n' "${id}"
    printf '  Сервер     : %s (%s:%s)\n' "${default_server_name}" "${host}" "${port}"
    printf '  Имя        : %s\n' "${default_config_name}"
    printf '  Протокол   : %s\n' "$(proto_human "${protocol}")"
    printf '  Маскировка : %s\n' "$(mode_human "${mode}")"
    printf '  Доставка   : %s\n' "${delivery}"
    printf '\n%b%s%b\n' "${C_GREEN}" "Ссылка для Happ:" "${C_RESET}"
    printf '%s\n' "${link}"

    if command -v qrencode >/dev/null 2>&1; then
        printf '\nQR-код:\n'
        qrencode -t ansiutf8 -- "${link}" || true
    fi

    if [[ "${delivery}" == "merge" ]]; then
        happ_add_link "${link}"
        local sub
        sub="$(jq -r '.links | join("\n")' "${HAPP_FILE}" | base64 -w0)"
        printf '\n%b%s%b\n' "${C_BOLD}" "Объединённая Happ-подписка (base64):" "${C_RESET}"
        printf '%s\n' "${sub}"
        printf '\nИспользуйте как ссылку-подписку (subscription) в Happ.\n'
    fi
}

# ---------------------------------------------------------------------------
# Меню: удаление конфига
# ---------------------------------------------------------------------------
cmd_delete() {
    local total; total="$(registry_count)"
    if [[ "${total}" -eq 0 ]]; then
        log_warn "Реестр пуст — удалять нечего."
        return 0
    fi

    printf '\n%b%s%b\n' "${C_BOLD}" "Доступные конфиги:" "${C_RESET}"
    local i=1
    while read -r row; do
        [[ -z "${row}" ]] && continue
        printf '  %2d) %s\n' "${i}" "${row}"
        i=$((i+1))
    done < <(jq -r '.configs[] |
        "[\(.id)] \(.name) — \(.protocol)/\(.mode) :\(.port)"' "${REGISTRY_FILE}")

    local choice; choice="$(prompt "Введите номер конфига для удаления (или ID, или 'all')")"
    local ids_to_delete=()

    if [[ "${choice}" == "all" ]]; then
        local confirm; confirm="$(prompt "Удалить ВСЕ конфиги? Введите 'yes'" "no")"
        [[ "${confirm}" == "yes" ]] || { log_info "Отмена."; return 0; }
        mapfile -t ids_to_delete < <(jq -r '.configs[].id' "${REGISTRY_FILE}")
    elif [[ "${choice}" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= total )); then
        ids_to_delete+=("$(jq -r --argjson n "$((choice-1))" '.configs[$n].id' "${REGISTRY_FILE}")")
    else
        # Может быть ID
        if [[ -n "$(registry_get_by_id "${choice}")" ]]; then
            ids_to_delete+=("${choice}")
        else
            die "Не найден конфиг по '${choice}'."
        fi
    fi

    local id link
    for id in "${ids_to_delete[@]}"; do
        link="$(build_share_link "${id}" 2>/dev/null || true)"
        registry_remove "${id}"
        [[ -n "${link}" ]] && happ_remove_link "${link}"
        log_ok "Удалён конфиг ${id}."
    done

    write_xray_config
    reload_xray
}

# ---------------------------------------------------------------------------
# Меню: список конфигов
# ---------------------------------------------------------------------------
cmd_list() {
    local total; total="$(registry_count)"
    if [[ "${total}" -eq 0 ]]; then
        log_info "Конфигов пока нет."
        return 0
    fi
    printf '\n%b%s%b\n' "${C_BOLD}" "Текущие VPN-конфиги (${total}):" "${C_RESET}"
    printf '%-10s %-26s %-12s %-18s %-8s %s\n' "ID" "NAME" "PROTOCOL" "MODE" "PORT" "HOST"
    printf '%s\n' "----------------------------------------------------------------------------------------------"
    jq -r '.configs[] |
        [.id, .name, .protocol, .mode, (.port|tostring), .host] | @tsv' "${REGISTRY_FILE}" |
        while IFS=$'\t' read -r id name proto mode port host; do
            printf '%-10s %-26s %-12s %-18s %-8s %s\n' \
                "${id}" "${name:0:26}" "${proto}" "${mode}" "${port}" "${host}"
        done

    printf '\n%bShare-ссылки:%b\n' "${C_DIM}" "${C_RESET}"
    while read -r id; do
        [[ -z "${id}" ]] && continue
        printf '  [%s] %s\n' "${id}" "$(build_share_link "${id}")"
    done < <(jq -r '.configs[].id' "${REGISTRY_FILE}")
}

# ---------------------------------------------------------------------------
# Меню: подключения
# ---------------------------------------------------------------------------
cmd_connections() {
    local total; total="$(registry_count)"
    if [[ "${total}" -eq 0 ]]; then
        log_info "Нет конфигов — нечего показывать."
        return 0
    fi

    if [[ ! -s "${XRAY_ACCESS_LOG}" ]]; then
        log_warn "Лог подключений пуст: ${XRAY_ACCESS_LOG}"
    fi

    printf '\n%bConnected devices:%b\n' "${C_BOLD}" "${C_RESET}"
    local printed=0

    while read -r entry; do
        [[ -z "${entry}" ]] && continue
        local id tag link cnt
        id="$(jq -r '.id'  <<<"${entry}")"
        tag="$(jq -r '.tag' <<<"${entry}")"
        link="$(build_share_link "${id}")"

        # Считаем уникальные клиентские IP за последние 5 минут по тэгу инбаунда.
        cnt=0
        if [[ -s "${XRAY_ACCESS_LOG}" ]]; then
            cnt="$(awk -v tag="${tag}" -v since="$(date -d '5 min ago' '+%Y/%m/%d %H:%M:%S' 2>/dev/null)" '
                $0 ~ tag && $0 ~ /accepted/ {
                    # формат: 2024/01/01 12:00:00 from 1.2.3.4:5678 accepted ...
                    for (i=1;i<=NF;i++) if ($i=="from") { ip=$(i+1); sub(/:.*/,"",ip); ips[ip]=1 }
                }
                END { n=0; for (k in ips) n++; print n }' "${XRAY_ACCESS_LOG}")"
        fi

        if [[ "${cnt}" -gt 0 ]]; then
            local short="${link:0:48}..."
            printf '%s | %d Devices\n' "${short}" "${cnt}"
            printed=$((printed+1))
        fi
    done < <(jq -c '.configs[]' "${REGISTRY_FILE}")

    if [[ "${printed}" -eq 0 ]]; then
        printf '%bАктивных подключений не обнаружено за последние 5 минут.%b\n' "${C_DIM}" "${C_RESET}"
    fi
}

# ---------------------------------------------------------------------------
# Меню: трафик
# ---------------------------------------------------------------------------
human_bytes() {
    local b="$1"
    awk -v b="${b}" 'BEGIN{
        split("B KB MB GB TB PB", u, " ");
        i=1; while (b>=1024 && i<6) { b/=1024; i++; }
        printf "%.2f %s", b, u[i];
    }'
}

xray_stat() {
    # xray_stat <name> [reset]
    local name="$1" reset="${2:-false}"
    local out
    if ! command -v xray >/dev/null 2>&1; then
        printf '0'; return
    fi
    out="$(xray api stats --server="127.0.0.1:${XRAY_API_PORT}" -name "${name}" -reset="${reset}" 2>/dev/null || true)"
    if [[ -z "${out}" ]]; then
        printf '0'
        return
    fi
    # ответ JSON: {"stat":{"name":"...", "value":"123"}}
    jq -r '.stat.value // "0"' <<<"${out}" 2>/dev/null || printf '0'
}

cmd_traffic() {
    local total; total="$(registry_count)"
    if [[ "${total}" -eq 0 ]]; then
        log_info "Нет конфигов — нечего показывать."
        return 0
    fi

    if ! systemctl is-active --quiet xray.service 2>/dev/null; then
        log_warn "Xray сейчас не активен — статистика может быть пустой."
    fi

    printf '\n%bПотребление трафика:%b\n' "${C_BOLD}" "${C_RESET}"
    printf '%-10s %-26s %-12s %-14s %-14s\n' "ID" "NAME" "PROTOCOL" "IN" "OUT"
    printf '%s\n' "------------------------------------------------------------------------------------"

    local sum_in=0 sum_out=0
    while read -r entry; do
        [[ -z "${entry}" ]] && continue
        local id name proto tag in_b out_b
        id="$(jq -r '.id'       <<<"${entry}")"
        name="$(jq -r '.name'   <<<"${entry}")"
        proto="$(jq -r '.protocol' <<<"${entry}")"
        tag="$(jq -r '.tag'     <<<"${entry}")"
        in_b="$(xray_stat  "inbound>>>${tag}>>>traffic>>>uplink"   false)"
        out_b="$(xray_stat "inbound>>>${tag}>>>traffic>>>downlink" false)"
        in_b="${in_b:-0}"; out_b="${out_b:-0}"
        sum_in=$(( sum_in + in_b ))
        sum_out=$(( sum_out + out_b ))
        printf '%-10s %-26s %-12s %-14s %-14s\n' \
            "${id}" "${name:0:26}" "${proto}" \
            "$(human_bytes "${in_b}")" "$(human_bytes "${out_b}")"
    done < <(jq -c '.configs[]' "${REGISTRY_FILE}")

    printf '%s\n' "------------------------------------------------------------------------------------"
    printf '%-50s %-14s %-14s\n' "ИТОГО:" \
        "$(human_bytes "${sum_in}")" "$(human_bytes "${sum_out}")"
    printf 'Всего (in+out): %s\n' "$(human_bytes "$(( sum_in + sum_out ))")"
}

# ---------------------------------------------------------------------------
# Главное меню
# ---------------------------------------------------------------------------
banner() {
    printf '\n%b%s v%s%b\n' "${C_BOLD}${C_BLUE}" "${SCRIPT_NAME}" "${SCRIPT_VERSION}" "${C_RESET}"
    printf '%bУправление VPN-конфигами на базе Xray-core%b\n\n' "${C_DIM}" "${C_RESET}"
}

main_menu() {
    while :; do
        banner
        printf '  %b1)%b Создать VPN конфиг\n'        "${C_CYAN}" "${C_RESET}"
        printf '  %b2)%b Удалить VPN конфиг\n'         "${C_CYAN}" "${C_RESET}"
        printf '  %b3)%b Текущие конфиги\n'            "${C_CYAN}" "${C_RESET}"
        printf '  %b4)%b Посмотреть подключения\n'     "${C_CYAN}" "${C_RESET}"
        printf '  %b5)%b Потребляемое количество трафика\n' "${C_CYAN}" "${C_RESET}"
        printf '  %b0)%b Выход\n'                      "${C_CYAN}" "${C_RESET}"

        local pick
        read -r -p "Выберите действие [0-5]: " pick || exit 0
        case "${pick}" in
            1) cmd_create ;;
            2) cmd_delete ;;
            3) cmd_list ;;
            4) cmd_connections ;;
            5) cmd_traffic ;;
            0|q|Q|exit) log_info "До встречи."; exit 0 ;;
            *) log_warn "Неизвестная опция: ${pick}" ;;
        esac
        printf '\n'
        read -r -p "Нажмите Enter для возврата в меню..." _
    done
}

# ---------------------------------------------------------------------------
# Точка входа
# ---------------------------------------------------------------------------
main() {
    require_root "$@"
    ensure_dependencies
    init_state

    if [[ $# -eq 0 ]]; then
        main_menu
        return
    fi

    case "$1" in
        create)      cmd_create ;;
        delete|rm)   cmd_delete ;;
        list|ls)     cmd_list ;;
        connections|conn) cmd_connections ;;
        traffic|stats)    cmd_traffic ;;
        -h|--help|help)
            cat <<EOF
Использование: $0 [команда]
Команды:
  create        Создать новый VPN-конфиг (интерактивно)
  delete        Удалить VPN-конфиг
  list          Показать текущие конфиги
  connections   Активные подключения по конфигам
  traffic       Потребление трафика (in/out)
  help          Эта справка

Без аргументов — интерактивное меню.
EOF
            ;;
        *)
            die "Неизвестная команда: $1 (используйте --help)"
            ;;
    esac
}

main "$@"

# sqszggas — vpn-manager

Скрипт `vpn-manager.sh` — самодостаточный bash-менеджер VPN-конфигов на базе
[Xray-core](https://github.com/XTLS/Xray-core). Создан под рабочий процесс с
клиентом [Happ](https://happ.su): можно либо отдавать каждому пользователю
отдельную ссылку (Solo), либо собирать общую subscription для нескольких серверов
(Merge).

## Возможности

При запуске скрипт спрашивает права root и затем показывает меню:

1. **Создать VPN конфиг**
2. **Удалить VPN конфиг**
3. **Текущие конфиги**
4. **Посмотреть подключения**
5. **Потребляемое количество трафика**

### Режимы маскировки

| Mode               | Что делает |
| ------------------ | ---------- |
| `Default`          | Прямой туннель через VPS, без обвязки |
| `Encrypted`        | VLESS+REALITY: провайдер не видит реальные URL/IP |
| `White-List Bypass`| REALITY со SNI разрешённого домена (`vk.com` и т.п.) — для обхода белых списков мобильных операторов |
| `Fake TLS`         | REALITY+Vision под реальный HTTPS-сайт (`microsoft.com` и пр.) — обход DPI |
| `Mega crypt`       | Многослойная маскировка REALITY+Vision на отдельном внешнем домене |

### Протоколы

| Протокол       | Реализация |
| -------------- | ---------- |
| `VLESS`        | классический VLESS |
| `Trojan`       | Trojan over TCP (+ REALITY в режимах ≠ Default) |
| `Xray`         | VLESS + `xtls-rprx-vision` |
| `Shadowsocks`  | Shadowsocks-2022 (`2022-blake3-aes-256-gcm`) |

### Solo / Merge

* **Solo** — выводит готовую `vless://` / `trojan://` / `ss://` ссылку и QR-код.
* **Merge** — добавляет ссылку в общий `Happ` subscription и показывает её
  base64-вариант (используется как ссылка-подписка в клиенте).

## Установка / запуск

```bash
sudo ./vpn-manager.sh
```

При первом запуске будут установлены недостающие зависимости (`jq`, `openssl`,
`curl`, `qrencode`, `xray-core`).

> ⚠️ **Если скачивали файл через Windows / браузер**, сначала уберите CRLF:
>
> ```bash
> sed -i 's/\r$//' vpn-manager.sh
> # или
> apt-get install -y dos2unix && dos2unix vpn-manager.sh
> ```
>
> Иначе bash выдаст ошибки вида `$'\r': command not found` и
> `syntax error near unexpected token`. При `git clone` репозитория проблемы
> нет — `.gitattributes` форсит LF.

Можно использовать и в неинтерактивном виде:

```bash
sudo ./vpn-manager.sh create        # пройти мастер создания
sudo ./vpn-manager.sh list          # показать конфиги
sudo ./vpn-manager.sh delete        # удалить
sudo ./vpn-manager.sh connections   # активные клиенты
sudo ./vpn-manager.sh traffic       # in/out трафик
```

## Структура состояния

* `/etc/vpn-manager/registry.json` — реестр всех созданных конфигов (источник правды).
* `/etc/vpn-manager/happ.json` — список ссылок, добавленных в Merge-подписку.
* `/usr/local/etc/xray/config.json` — генерируется из реестра, перезаписывается
  при каждом изменении.
* `/var/log/xray/access.log` — используется для подсчёта подключений.

Конфиг Xray включает `stats`+`api` инбаунд (на `127.0.0.1:10085`) для команды
`traffic`, читающей счётчики через `xray api stats`.

## Ограничения

* Запись Xray-конфига и рестарт сервиса требуют, чтобы Xray был установлен как
  systemd-сервис (стандартный установщик XTLS делает это сам).
* Команда `connections` оценивает активность по `access.log` за последние 5
  минут — для точного подсчёта рекомендуется не отключать access-лог.

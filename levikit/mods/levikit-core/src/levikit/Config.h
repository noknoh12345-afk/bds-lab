#pragma once

#include <string>
#include <vector>

// panel (levikit-panel) が書き換えるのはこのファイル: plugins/levikit-core/config/config.json
// 欠けているキーは読み込み時に既定値で補完される（Core.cpp normalizeConfig）

namespace levikit {

struct SpawnPoint {
    double x = 0.5;
    double y = 100.0;
    double z = 0.5;
};

/// ワールド(ディメンション)ごとのルール
struct WorldRules {
    // 入場時に切り替えるゲームモード: "" (変更しない) / survival / creative / adventure / spectator
    std::string gameMode;
    // 持ち物グループ。同じグループ同士は持ち物共通、違うグループへ移ると持ち物が切り替わる
    std::string inventoryGroup = "default";
    // プレイヤー同士のダメージ
    bool pvp = true;
    // 死んでも持ち物を落とさない（このワールドだけの keepInventory）
    bool keepInventory = false;
    // 死んだらこのワールドのスポーン地点で復活する
    bool respawnInWorld = false;
    // 建築保護: none / all / spawn（spawn はスポーン周辺 protectionRadius ブロック）
    std::string protection       = "none";
    int         protectionRadius = 32;
    // 保護範囲ではチェストやドアなどの操作も禁止する
    bool protectInteract = false;
    // 保護範囲でも建築できる人（OP は常に可）
    std::vector<std::string> builders{};
    // 自然スポーン: all / noHostile / none
    std::string mobSpawning = "all";
    // 正方形のワールドボーダー（半径ブロック, 0 で無効）
    int    borderRadius        = 0;
    bool   borderCenterOnSpawn = true;
    double borderCenterX       = 0.0;
    double borderCenterZ       = 0.0;
    // 時間固定（見た目, 0-23999。-1 で無効。6000=正午 18000=真夜中）
    int timeLock = -1;
    // このワールド専用のネザー（ネザー型カスタムワールドの ID）。空なら通常のネザーへ
    //   このワールドでネザーゲートに入る → 指定ワールドの x/8, z/8 へ。そのワールドでゲートに入る → このワールドの x*8, z*8 へ
    std::string netherLink;
    // 同時に入れる人数（0 で無制限）
    int maxPlayers = 0;
    // false にすると閉鎖（OP 以外は入れず、中にいる人は外へ出される）
    bool open   = true;
    bool opOnly = false;
    // 空でなければ、この名前/XUID の人だけ入れる
    std::vector<std::string> allowedPlayers{};
    // 入場時のタイトル表示
    std::string enterTitle;
    std::string enterSubtitle;
    // 入退場時に実行するコマンド（{player} はプレイヤー名に置き換え）
    std::vector<std::string> enterCommands{};
    std::vector<std::string> leaveCommands{};
};

struct DimensionEntry {
    // "namespace:name" 形式。minecraft: 名前空間は使えない（MoreDimensions の制約）
    std::string name;
    std::string displayName;
    std::string description;
    // /dim メニューのボタン画像（リソースパック内のパス。例 textures/blocks/grass_side_carried）
    std::string icon;
    // Overworld / Flat / Nether / TheEnd / Void（作成時とリセット時に使われる）
    std::string  generator = "Overworld";
    unsigned int seed      = 0;
    SpawnPoint   spawn{};
    // auto / surface / platform / fixed
    std::string landing = "auto";
    bool        enabled = true;
    WorldRules  rules{};
};

struct VanillaEntry {
    std::string displayName;
    std::string description;
    std::string icon;
    SpawnPoint  spawn{};
    std::string landing = "auto";
    bool        show    = true;
    WorldRules  rules{};
};

/// どのワールドからでも飛べる地点
struct Warp {
    std::string name;
    // overworld / nether / the_end / namespace:name
    std::string world = "overworld";
    double      x     = 0.5;
    double      y     = 100.0;
    double      z     = 0.5;
    float       yaw   = 0.0f;
    std::string description;
    bool        opOnly = false;
};

/// 範囲に入ると別のワールド/ワープへ飛ばす「ポータル」
struct Portal {
    std::string name;
    std::string world = "overworld";
    int         x1    = 0;
    int         y1    = 0;
    int         z1    = 0;
    int         x2    = 0;
    int         y2    = 0;
    int         z2    = 0;
    // "world:<名前>" / "warp:<名前>" / "last:<名前>"（そのワールドで最後にいた位置）
    std::string target;
    std::string message;
    bool        enabled = true;
};

struct BanEntry {
    std::string name;
    std::string xuid;
    std::string reason;
    // UNIX 秒。0 なら無期限
    long long   until = 0;
    std::string by;
};

/// 名前付きの権限グループ。各リスト（建築できる人・入場許可・メンテナンス許可）で "@名前" と書ける
struct Role {
    std::string              name;
    std::vector<std::string> members{};
};

/// パネルが書き込む: 起動時にパッケージ(.lkdim)をディメンションへ取り込む
struct ImportJob {
    // 取り込み先（登録済みのカスタムディメンション名）
    std::string name;
    // plugins/levikit-core/data からの相対パス
    std::string file;
    // 取り込み前に、そのディメンションの既存データを消す
    bool clearFirst = true;
};

/// パネルが書き込む: 起動時にディメンションを複製する
struct CloneJob {
    std::string from;
    std::string to;
};

struct HubConfig {
    // none / firstJoin / always
    std::string mode = "none";
    // "world:<名前>" か "warp:<名前>"
    std::string target;
};

struct Config {
    int version = 4;

    // 待機サーバー(limbo)として動かす場合 true。ディメンションは登録しない
    bool        limboMode    = false;
    std::string limboMessage = "§e[LeviKit] §fサーバーを更新/復元しています。完了すると自動で元のワールドへ戻ります…";

    // /dim を全員に開放するか（false なら OP のみ）
    bool dimCommandForEveryone = true;
    // ワールド間移動時に最後の座標を記憶して戻す
    bool rememberLastPosition = true;
    // 持ち物グループ機能（ワールドごとに持ち物を分ける）
    bool separateInventories = true;
    // チャット: global（通常）/ prefix（全体に [ワールド名] を付ける）/ world（同じワールドだけ。! で全体）
    std::string chatMode = "global";
    // ゲームモード指定のあるワールドから、指定の無いワールドへ移ったときに戻すゲームモード
    std::string defaultGameMode = "survival";
    // このアイテムを使うと /dim メニューが開く（空で無効）
    std::string menuItem = "minecraft:compass";
    // 参加時に送り込む場所（ロビー）
    HubConfig hub{};
    // /tpa（ワールドをまたいで相手の所へ）
    bool tpaEnabled        = true;
    bool tpaCrossWorld     = true;
    int  tpaTimeoutSeconds = 60;
    // /spawn と /back
    bool spawnCommand = true;
    bool backCommand  = true;
    // 権限グループ
    std::vector<Role> roles{};

    // メンテナンスモード: OP と maintenanceAllow 以外は入れない
    bool                     maintenance        = false;
    std::string              maintenanceMessage = "§cただいまメンテナンス中です。しばらくお待ちください";
    std::vector<std::string> maintenanceAllow{};
    std::vector<BanEntry>    bans{};
    // 参加時メッセージ（{name} {online} が使える。空なら無効）
    std::string welcomeMessage = "§a{name} さん、ようこそ！ §7/dim でワールドを切り替えられます";
    // パネル向け統計の出力間隔（秒, 0 で無効）
    int statsIntervalSeconds = 10;

    VanillaEntry overworld{
        .displayName = "オーバーワールド",
        .description = "メインのサバイバルワールド",
        .icon        = "textures/blocks/grass_side_carried",
        .spawn       = {0.5, 100.0, 0.5},
        .landing     = "surface",
    };
    VanillaEntry nether{
        .displayName = "ネザー",
        .icon        = "textures/blocks/netherrack",
        .spawn       = {0.5, 70.0, 0.5},
        .landing     = "platform",
    };
    VanillaEntry theEnd{
        .displayName = "ジ・エンド",
        .icon        = "textures/blocks/end_stone",
        .spawn       = {100.5, 49.0, 0.5},
        .landing     = "fixed",
    };

    std::vector<DimensionEntry> dimensions{
        {
         .name        = "levikit:resource",
         .displayName = "資源ワールド",
         .description = "定期的にリセットされる採掘用ワールド",
         .icon        = "textures/blocks/iron_ore",
         .generator   = "Overworld",
         .seed        = 20261106u,
         .spawn       = {0.5, 120.0, 0.5},
         .landing     = "surface",
         .rules       = WorldRules{.borderRadius = 3000, .enterTitle = "§6資源ワールド", .enterSubtitle = "§7定期的にリセットされます"},
         },
        {
         .name        = "levikit:flat",
         .displayName = "建築ワールド",
         .description = "クリエイティブ・持ち物別・モブなし・常に昼",
         .icon        = "textures/blocks/brick",
         .generator   = "Flat",
         .seed        = 1u,
         .spawn       = {0.5, -60.0, 0.5},
         .landing     = "fixed",
         .rules =
                WorldRules{
                    .gameMode       = "creative",
                    .inventoryGroup = "creative",
                    .pvp            = false,
                    .keepInventory  = true,
                    .respawnInWorld = true,
                    .mobSpawning    = "none",
                    .timeLock       = 6000,
                },
         },
        {
         .name        = "levikit:void",
         .displayName = "虚空ワールド",
         .description = "何もない空間。スカイブロックやイベントに",
         .icon        = "textures/blocks/glass",
         .generator   = "Void",
         .seed        = 1u,
         .spawn       = {0.5, 64.0, 0.5},
         .landing     = "platform",
         .rules       = WorldRules{.keepInventory = true, .respawnInWorld = true},
         },
    };

    std::vector<Warp>   warps{};
    std::vector<Portal> portals{};

    // パネルが書き込む: 次回起動時にリセット（全チャンク削除して作り直す）するディメンション
    std::vector<std::string> pendingResets{};
    std::vector<ImportJob>   pendingImports{};
    std::vector<CloneJob>    pendingClones{};
};

} // namespace levikit

// 持ち物グループ: インベントリ・防具・オフハンド・エンダーチェストの保存と復元
#include "levikit/Common.h"

#include "mc/deps/nbt/CompoundTag.h"
#include "mc/deps/shared_types/legacy/actor/ArmorSlot.h"
#include "mc/world/actor/player/Inventory.h"
#include "mc/world/actor/player/Player.h"
#include "mc/world/inventory/EnderChestContainer.h"
#include "mc/world/item/ItemStack.h"
#include "mc/world/item/SaveContext.h"
#include "mc/world/item/SaveContextFactory.h"

#include <cctype>

namespace levikit {

namespace {

std::string itemToSnbt(ItemStack const& item, SaveContext const& ctx) {
    if (item.isNull()) return {};
    auto tag = item.save(ctx);
    if (!tag) return {};
    return tag->toSnbt(SnbtFormat::Minimize, 0);
}

ItemStack itemFromSnbt(std::string const& s) {
    if (s.empty()) return ItemStack::EMPTY_ITEM();
    auto tag = CompoundTag::fromSnbt(s);
    if (!tag) return ItemStack::EMPTY_ITEM();
    return ItemStack::fromTag(*tag);
}

std::string at(Json const& j, char const* key, size_t i) {
    if (!j.contains(key)) return {};
    auto const& a = j[key];
    if (!a.is_array() || i >= a.size() || !a[i].is_string()) return {};
    return a[i].get<std::string>();
}

} // namespace

std::filesystem::path inventoryPath(std::string const& uuid, std::string const& group) {
    std::string safe;
    for (char c : group) safe.push_back((std::isalnum(static_cast<unsigned char>(c)) || c == '-' || c == '_') ? c : '_');
    return worldData() / u8"inventories" / std::filesystem::path(uuid) / std::filesystem::path(safe + ".json");
}

Json snapshotInventory(Player& p) {
    auto  ctx = SaveContextFactory::createCloneSaveContext();
    Json  j;
    auto& inv = p.getInventory();
    auto  arr = Json::array();
    for (int i = 0; i < inv.getContainerSize(); ++i) arr.push_back(itemToSnbt(inv.getItem(i), *ctx));
    j["inventory"] = arr;
    auto armor     = Json::array();
    for (int i = 0; i < 4; ++i) {
        armor.push_back(itemToSnbt(p.getArmor(static_cast<SharedTypes::Legacy::ArmorSlot>(i)), *ctx));
    }
    j["armor"]   = armor;
    j["offhand"] = itemToSnbt(p.getOffhandSlot(), *ctx);
    if (auto ec = p.getEnderChestContainer()) {
        auto ender = Json::array();
        for (int i = 0; i < ec->getContainerSize(); ++i) ender.push_back(itemToSnbt(ec->getItem(i), *ctx));
        j["enderChest"] = ender;
    }
    j["savedAt"] = nowUnix();
    return j;
}

void applyInventory(Player& p, Json const& j) {
    auto& inv = p.getInventory();
    for (int i = 0; i < inv.getContainerSize(); ++i) inv.setItem(i, itemFromSnbt(at(j, "inventory", static_cast<size_t>(i))));
    for (int i = 0; i < 4; ++i) {
        p.setArmor(static_cast<SharedTypes::Legacy::ArmorSlot>(i), itemFromSnbt(at(j, "armor", static_cast<size_t>(i))));
    }
    p.setOffhandSlot(itemFromSnbt(j.contains("offhand") && j["offhand"].is_string() ? j["offhand"].get<std::string>() : ""));
    if (auto ec = p.getEnderChestContainer()) {
        // enderChest キーが無い（死亡時の保持など）ときはエンダーチェストを触らない
        if (j.contains("enderChest")) {
            for (int i = 0; i < ec->getContainerSize(); ++i) ec->setItem(i, itemFromSnbt(at(j, "enderChest", static_cast<size_t>(i))));
        }
    }
    p.sendInventory(false);
}

void clearInventory(Player& p) {
    auto& inv = p.getInventory();
    for (int i = 0; i < inv.getContainerSize(); ++i) inv.setItem(i, ItemStack::EMPTY_ITEM());
    for (int i = 0; i < 4; ++i) p.setArmor(static_cast<SharedTypes::Legacy::ArmorSlot>(i), ItemStack::EMPTY_ITEM());
    p.setOffhandSlot(ItemStack::EMPTY_ITEM());
    p.sendInventory(false);
}

} // namespace levikit

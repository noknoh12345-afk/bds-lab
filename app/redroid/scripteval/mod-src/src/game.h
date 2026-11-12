// Client-side game model: finds the local player, the client entity registry,
// the client level and the player list purely from memory, and exposes typed
// accessors for actors (position, rotation, identifiers, names, ...).
#pragma once

#include <atomic>
#include <cstdint>
#include <map>
#include <mutex>
#include <string>
#include <vector>

#include "cxxtypes.h"
#include "ecs.h"

namespace se::game {

struct ActorRef {
    uintptr_t addr = 0;
    uint32_t entity = 0;
};

struct PlayerListEntry {
    int64_t uniqueId = 0;
    std::string uuid;
    std::string name, xuid, platformOnlineId;
    int buildPlatform = -1;
    uintptr_t node = 0;
};

struct Attribute {
    std::string name;
    float current = 0, min = 0, max = 0, defaultValue = 0;
};

struct ItemInfo {
    int slot = -1;
    std::string typeId;
    int count = 0;
    int aux = 0;
    uintptr_t addr = 0;
};

struct ScoreEntry {
    std::string participant;  // fake player name, or player name resolved via the player list
    int type = 0;             // 1 player, 2 entity, 3 fake player
    int64_t scoreboardId = 0;
    int64_t entityId = 0;
    int score = 0;
};
struct ObjectiveInfo {
    uintptr_t addr = 0;
    std::string name, displayName, criteria;
    std::vector<ScoreEntry> scores;
};
struct DisplayInfo {
    std::string slot;
    std::string objective;
    int sortOrder = 0;
};
struct ScoreboardInfo {
    uintptr_t addr = 0;
    std::string cls;
    std::vector<ObjectiveInfo> objectives;
    std::vector<DisplayInfo> displays;
};

struct Offsets {
    // Actor
    int entityContext = -1;  // EntityContext {EntityRegistry&, basic_registry&, EntityId}
    int registryPtr = -1;    // entt::basic_registry* inside the actor (normally entityContext + 8)
    int entityId = -1;       // EntityId inside the actor (normally entityContext + 16)
    int level = -1;          // ILevel*
    int dimension = -1;      // WeakRef<Dimension> (first word = Dimension*)
    int stateVectorPtr = -1; // BuiltInActorComponents::state_vector_component
    int playerName = -1;     // Player::name_ (std::string)
    // PlayerListEntry (relative to the start of the unordered_map node)
    int pleUuidVal = -1;
    // Level
    int playerListMapPath0 = -1;  // offset of pointer in Level (or -2 = inline)
    int playerListMapPath1 = -1;  // offset of the map in the pointed object
    std::string toJson() const;
};

struct Status {
    bool rttiReady = false;
    bool inWorld = false;
    std::string error;
    std::string localPlayerClass;
    uintptr_t localPlayer = 0;
    uint32_t localEntity = 0;
    uintptr_t registry = 0;
    size_t storages = 0;
    size_t actors = 0;
    uintptr_t level = 0;
    std::string levelClass;
    bool playerList = false;
    std::string scanStats;
    uint64_t discoveryMs = 0;
};

class Game {
public:
    // Makes sure the world anchors are valid; runs discovery when needed.
    // `allowScan` = false forbids the (slow) heap scan.
    bool ensure(std::string* err = nullptr, bool allowScan = true);
    bool quickValid();
    void invalidate();
    // Called by the tick hook with the object whose virtual function was called.
    void noteLocalPlayerCandidate(uintptr_t obj);
    Status status();
    const Offsets& offsets() const { return off_; }
    Offsets& mutableOffsets() { return off_; }
    ecs::Registry& registry() { return reg_; }
    uintptr_t localPlayer() const { return localPlayer_; }
    // lock-free copy for the game thread
    uintptr_t localPlayerHint() const { return localPlayerAtomic_.load(); }
    uint32_t localEntity() const { return localEntity_; }
    uintptr_t level() const { return level_; }
    uint64_t generation() const { return generation_; }

    // ---- enumeration
    std::vector<ActorRef> actors();
    bool refValid(const ActorRef& r);
    bool refFromAddr(uintptr_t addr, ActorRef& out);

    // ---- per actor accessors
    std::string className(const ActorRef& r);
    bool isPlayer(const ActorRef& r);
    bool isLocal(const ActorRef& r) { return r.addr == localPlayer_; }
    bool position(const ActorRef& r, cxx::Vec3& raw, cxx::Vec3& prev, cxx::Vec3& delta);
    bool feetPosition(const ActorRef& r, cxx::Vec3& feet);
    bool aabb(const ActorRef& r, cxx::Vec3& mn, cxx::Vec3& mx, float& w, float& h);
    bool rotation(const ActorRef& r, float& pitch, float& yaw);
    bool headYaw(const ActorRef& r, float& yaw);
    bool bodyYaw(const ActorRef& r, float& yaw);
    bool heightOffset(const ActorRef& r, float& h);
    bool typeId(const ActorRef& r, std::string& out);
    bool uniqueId(const ActorRef& r, int64_t& out);
    bool runtimeId(const ActorRef& r, uint64_t& out);
    bool dimensionId(const ActorRef& r, int& out);
    bool gameMode(const ActorRef& r, int& out);
    bool actorType(const ActorRef& r, uint32_t& out);
    bool nameTag(const ActorRef& r, std::string& out);
    bool playerName(const ActorRef& r, std::string& out);
    bool flags(const ActorRef& r, uint64_t out[2]);
    bool hasComponent(const ActorRef& r, const std::string& name);
    bool attributes(const ActorRef& r, std::vector<Attribute>& out);
    bool synchedData(const ActorRef& r, std::vector<std::pair<int, std::string>>& out);  // id -> printable value
    bool equipment(const ActorRef& r, std::vector<ItemInfo>& hand, std::vector<ItemInfo>& armor);
    bool inventory(const ActorRef& r, std::vector<ItemInfo>& items, int& selected);
    uintptr_t dimensionObject(const ActorRef& r);

    // ---- world
    bool playerList(std::vector<PlayerListEntry>& out);
    bool scoreboard(ScoreboardInfo& out, std::string* err);
    std::string dimensionName(int id);

    // ---- generic helpers (also used by the JS debug API)
    bool readContainerItems(uintptr_t container, std::vector<ItemInfo>& out);
    bool readItemStack(uintptr_t stack, ItemInfo& out);

private:
    bool discover(std::string* err, bool allowScan);
    bool validateLocalPlayer(uintptr_t obj, uintptr_t& registry, uint32_t& entity, int& regOff, int& idOff);
    void calibrateComponents();
    void calibrateSizes();
    void findLevel();
    void findPlayerList();
    void findPlayerNameOffset();
    void findDimensionOffset();
    uintptr_t comp(const ActorRef& r, const char* name);

    std::recursive_mutex mu_;
    Offsets off_;
    ecs::Registry reg_;
    uintptr_t localPlayer_ = 0;
    uintptr_t localPlayerTi_ = 0;
    uint32_t localEntity_ = 0;
    uintptr_t level_ = 0;
    std::string levelClass_;
    uintptr_t playerListMap_ = 0;
    uintptr_t scoreboard_ = 0;
    std::atomic<uintptr_t> candidate_{0};
    std::atomic<uintptr_t> localPlayerAtomic_{0};
    uint64_t lastScanFail_ = 0;
    uint64_t generation_ = 0;
    std::string lastError_;
    std::string scanStats_;
    uint64_t discoveryMs_ = 0;
    uintptr_t playerTi_ = 0;
    uintptr_t actorTi_ = 0;
};

Game& game();

// Known element sizes (bytes) of Bedrock ECS components on 64-bit libc++.
const std::map<std::string, uint32_t>& knownComponentSizes();

}  // namespace se::game

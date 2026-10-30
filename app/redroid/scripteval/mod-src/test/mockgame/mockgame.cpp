// Mock "libminecraftpe.so" used to test ScriptEval on a normal Linux host.
//
// It mimics the parts of Bedrock that ScriptEval relies on: polymorphic
// classes with RTTI (Actor/Mob/Player/LocalPlayer/RemotePlayer, Level,
// Dimension, BlockSource, Block, BlockType, DataItem2<T>, AttributeInstance,
// containers, items), an EnTT registry with Mojang's EntityId traits and the
// same component types, a player list unordered_map and a 20 Hz game thread
// that calls LocalPlayer virtual functions every tick.
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

#include <entt/entity/entity.hpp>
#include <entt/entity/registry.hpp>
#include <entt/entity/storage.hpp>

#define API extern "C" __attribute__((visibility("default")))

// ---------------------------------------------------------------- EntityId (Bedrock traits)
class EntityId;
struct EntityIdTraits {
    using value_type = EntityId;
    using entity_type = std::uint32_t;
    using version_type = std::uint16_t;
    static constexpr entity_type entity_mask = 0x3FFFF;
    static constexpr entity_type version_mask = 0x3FFF;
};
namespace entt {
template <>
struct entt_traits<EntityId> : basic_entt_traits<EntityIdTraits> {
    static constexpr std::size_t page_size = ENTT_SPARSE_PAGE;
};
}  // namespace entt
class EntityId {
    template <typename Traits>
    friend class entt::basic_entt_traits;

public:
    using entity_type = std::uint32_t;
    constexpr EntityId(entity_type raw) : raw_(raw) {}
    EntityId() = default;
    constexpr operator entity_type() const { return raw_; }
    entity_type raw_ = ~0u;
};
using EnTTRegistry = entt::basic_registry<EntityId>;

// ---------------------------------------------------------------- basic types
struct Vec3 {
    float x, y, z;
};
struct Vec2 {
    float x, y;
};
struct AABB {
    Vec3 min, max;
};
struct BlockPos {
    int x, y, z;
};
namespace mce {
struct UUID {
    uint64_t a, b;
    bool operator==(const UUID& o) const { return a == o.a && b == o.b; }
};
}  // namespace mce
template <>
struct std::hash<mce::UUID> {
    size_t operator()(const mce::UUID& u) const { return std::hash<uint64_t>()(u.a ^ (u.b * 31)); }
};

struct HashedString {
    uint64_t hash = 0;
    std::string str;
    const HashedString* lastMatch = nullptr;
    HashedString() = default;
    explicit HashedString(const std::string& s) : str(s) {
        if (!s.empty()) {
            uint64_t h = 0xCBF29CE484222325ULL;
            for (unsigned char c : s) {
                h *= 0x100000001B3ULL;
                h ^= c;
            }
            hash = h;
        }
    }
};

// ---------------------------------------------------------------- forward decls
class Actor;
class Dimension;
class BlockSource;

// ---------------------------------------------------------------- components
struct ActorOwnerComponent {
    std::unique_ptr<Actor> actor;
};
struct StateVectorComponent {
    static constexpr auto in_place_delete = true;
    Vec3 pos, posPrev, posDelta;
};
struct AABBShapeComponent {
    static constexpr auto in_place_delete = true;
    AABB aabb;
    Vec2 dim;
};
struct ActorRotationComponent {
    static constexpr auto in_place_delete = true;
    Vec2 rot, rotPrev;
};
struct ActorWalkAnimationComponent {
    static constexpr auto in_place_delete = true;
    float v[8];
};
struct ActorDefinitionIdentifier {
    std::string ns, id, initEvent, fullName;
    HashedString canonical;
};
struct ActorDefinitionIdentifierComponent {
    ActorDefinitionIdentifier identifier;
#ifdef MOCK_ALT
    std::string extra = "some extra field";  // layout drift: element size 160 instead of 136
#endif
};
struct RuntimeIDComponent {
    uint64_t id;
#ifdef MOCK_ALT
    uint64_t generation = 77;  // layout drift: 16 bytes
#endif
};
struct ActorUniqueIDComponent {
    int64_t id;
};
struct DimensionTypeComponent {
    int type;
#ifdef MOCK_ALT
    int pad = 0;
#endif
};
struct ActorGameTypeComponent {
    int type;
};
struct ActorTypeComponent {
    uint32_t type;
};
struct OffsetsComponent {
    float heightOffset, explosionOffset;
    Vec3 head, drop, eye, mouth, breathing;
};
struct MobBodyRotationComponent {
    float yBodyRot, yBodyRotOld;
};
struct ActorHeadRotationComponent {
    float yHeadRot, yHeadRotOld;
};
struct OnGroundFlagComponent {};
struct PlayerComponent {};
struct WasInWaterFlagComponent {};
struct ActorDataFlagComponent {
    uint64_t bits[2];
};

// DataItem / SynchedActorData
enum class DataItemType : uint8_t { Byte = 0, Short = 1, Int = 2, Float = 3, String = 4, CompoundTag = 5, Pos = 6, Int64 = 7, Vec3 = 8 };
class DataItem {
public:
    virtual ~DataItem() = default;
    virtual uint16_t getId() const = 0;
    virtual DataItemType getType() const = 0;
};
template <class T>
class DataItem2 : public DataItem {
public:
    DataItem2(DataItemType t, uint16_t id, T v) : type_(t), id_(id), data(std::move(v)) {}
    uint16_t getId() const override { return id_; }
    DataItemType getType() const override { return type_; }
    const DataItemType type_;
    const uint16_t id_;
    T data;
};
struct SynchedActorData {
    std::vector<std::unique_ptr<DataItem>> items;
    uint64_t dirty[3]{};
    uint64_t hasData[3]{};
    SynchedActorData() = default;
    SynchedActorData(const SynchedActorData&) = delete;
    SynchedActorData(SynchedActorData&&) = default;
    SynchedActorData& operator=(SynchedActorData&&) = default;
};
struct SynchedActorDataComponent {
    SynchedActorData data;
};

// Attributes
class Attribute {
public:
    uint8_t mode = 0;
    bool syncable = true;
    uint32_t id;
    HashedString name;
    Attribute(uint32_t i, const char* n) : id(i), name(n) {}
};
class AttributeInstance {
public:
    virtual ~AttributeInstance() = default;
    const Attribute* attribute;
    std::vector<void*> modifiers, buffs, listeners;
    std::shared_ptr<void> delegate;
    float defaults[3];
    float current[3];
    bool changed = false;
    AttributeInstance(const Attribute* a, float mn, float mx, float v) : attribute(a), defaults{mn, mx, v}, current{mn, mx, v} {}
};
struct AttributesComponent {
    std::vector<uint32_t> keys;
    std::vector<AttributeInstance> values;
    std::vector<void*> dirty;
    void* fn[2]{};
};
static Attribute g_health(7, "minecraft:health");
static Attribute g_movement(3, "minecraft:movement");

// Items & containers
class Item {
public:
    virtual ~Item() = default;
    virtual bool isFood() const { return false; }
    int maxStack = 64;
    std::string iconName;
    HashedString rawNameId;
    std::string ns;
    HashedString fullName;
    Item(const std::string& id) : iconName(id + "_icon"), rawNameId(id), ns("minecraft"), fullName("minecraft:" + id) {}
};
class SwordItem : public Item {
public:
    using Item::Item;
};
template <class T>
struct SharedCounter {
    T* ptr;
    std::atomic<int> share{1}, weak{1};
};
class ItemStackBase {
public:
    virtual ~ItemStackBase() = default;
    virtual void reinit() {}
    SharedCounter<Item>* item = nullptr;
    void* userData = nullptr;
    const void* block = nullptr;
    int16_t aux = 0;
    uint8_t count = 0;
    bool valid = true;
    bool showPickup = true, wasPickedUp = false;
    int64_t pickupTime = 0;
    std::vector<void*> canPlaceOn;
    size_t h1 = 0;
    std::vector<void*> canDestroy;
    size_t h2 = 0;
    uint64_t blockingTick = 0;
    void* charged = nullptr;
};
class ItemStack : public ItemStackBase {
public:
    uint64_t netId[3]{};
};
class Container {
public:
    virtual ~Container() = default;
    virtual int getContainerSize() const = 0;
    uint8_t containerType = 0, gameplayType = 0;
    void* publisher[4]{};
    std::string name = "container";
};
class SimpleContainer : public Container {
public:
    int size_;
    std::vector<ItemStack> items_;
    explicit SimpleContainer(int n) : size_(n), items_(n) {}
    int getContainerSize() const override { return size_; }
};
class Inventory : public Container {
public:
    int size_ = 36;
    std::vector<ItemStack> items_ = std::vector<ItemStack>(36);
    int getContainerSize() const override { return size_; }
};
class ContainerSizeChangeListener {
public:
    virtual ~ContainerSizeChangeListener() = default;
    virtual void onSize() {}
};
class ContainerContentChangeListener {
public:
    virtual ~ContainerContentChangeListener() = default;
    virtual void onContent() {}
};
class PlayerInventory : public ContainerSizeChangeListener, public ContainerContentChangeListener {
public:
    int selected = 2;
    ItemStack infinite;
    int selectedContainer = 0;
    std::unique_ptr<Inventory> inventory = std::make_unique<Inventory>();
};
struct ActorEquipmentComponent {
    std::unique_ptr<SimpleContainer> hand, armor;
};

// ---------------------------------------------------------------- blocks
class BlockType {
public:
    virtual ~BlockType() = default;
    virtual bool isSolid() const { return true; }
    HashedString rawName;
    std::string ns = "minecraft";
    HashedString fullName;
    explicit BlockType(const std::string& id) : rawName(id), fullName("minecraft:" + id) {}
};
class Block {
public:
    virtual ~Block() = default;
    char components[96]{};
    BlockType* type;
    std::vector<HashedString> tags;
    uint32_t networkId;
    Block(BlockType* t, uint32_t nid, std::vector<HashedString> tg) : type(t), tags(std::move(tg)), networkId(nid) {}
};
class IConstBlockSource {
public:
    virtual ~IConstBlockSource() = default;
    virtual const Block& getBlock(const BlockPos&) const = 0;
    virtual const Block& getBlock(const BlockPos&, uint32_t) const = 0;
    virtual bool hasBlock(const BlockPos&) const = 0;
};
class IBlockSource : public IConstBlockSource {
public:
    virtual int getMinHeight() const = 0;
};
static BlockType g_airT("air"), g_stoneT("stone"), g_grassT("grass_block"), g_bedrockT("bedrock");
static Block g_air(&g_airT, 0, {}), g_stone(&g_stoneT, 1, {HashedString("stone"), HashedString("minecraft:is_pickaxe_item_destructible")}),
    g_grass(&g_grassT, 2, {HashedString("grass"), HashedString("dirt")}), g_bedrock(&g_bedrockT, 3, {});
class BlockSource : public IBlockSource, public std::enable_shared_from_this<BlockSource> {
public:
    Dimension* dim = nullptr;
    const Block& getBlock(const BlockPos& p) const override {
        if (p.y < -64) return g_air;
        if (p.y == -64) return g_bedrock;
        if (p.y < 63) return g_stone;
        if (p.y == 63) return g_grass;
        return g_air;
    }
    const Block& getBlock(const BlockPos& p, uint32_t) const override { return getBlock(p); }
    bool hasBlock(const BlockPos&) const override { return true; }
    int getMinHeight() const override { return -64; }
};
struct BlockSourceComponent {
    std::weak_ptr<BlockSource> bs;
};

// ---------------------------------------------------------------- level / dimension
class ILevel {
public:
    virtual ~ILevel() = default;
    virtual int getTime() const = 0;
    virtual void tick() = 0;
};
class Dimension {
public:
    virtual ~Dimension() = default;
    virtual void tick() {}
    ILevel* level = nullptr;
    short seaLevel = 63;
    std::shared_ptr<BlockSource> blockSource;
    std::string name;
    std::string typeId;
    int id = 0;
};
class OverworldDimension : public Dimension {
public:
    OverworldDimension() {
        name = "Overworld";
        typeId = "minecraft:overworld";
        id = 0;
    }
};

struct BuildPlatform {
    int v;
};
struct PlayerListEntry {
    int64_t id;
    mce::UUID uuid;
    std::string name, xuid, platformOnlineId;
    int buildPlatform = 7;
    void* skin[2]{};
    float color[4]{1, 1, 1, 1};
    bool isTeacher = false, isHost = false, isSubClient = false;
};
struct PlayerListManager {
    std::unordered_map<mce::UUID, PlayerListEntry> list;
    void* packetSender[3]{};
};

class EntityRegistry : public std::enable_shared_from_this<EntityRegistry> {
public:
    std::string debugName = "ClientEntityRegistry";
    EnTTRegistry registry;
    uint32_t id = 1;
    std::function<void(EntityId)> pre, post;
};

#ifdef MOCK_ALT
struct LevelSubsystems {
    void* a = nullptr;
    void* b = nullptr;
    std::unique_ptr<PlayerListManager> plm = std::make_unique<PlayerListManager>();
};
#endif
// ---------------------------------------------------------------- scoreboard
struct IdentityDefinition;
struct ScoreboardId {
    int64_t rawId = -1;
    IdentityDefinition* def = nullptr;
    bool operator==(const ScoreboardId& o) const { return rawId == o.rawId; }
};
template <>
struct std::hash<ScoreboardId> {
    size_t operator()(const ScoreboardId& s) const { return std::hash<int64_t>()(s.rawId); }
};
struct IdentityDefinition {
    ScoreboardId id;
    bool hiddenFake = false;
    int64_t playerId = 0;
    int64_t entityId = 0;
    std::string playerName;
    uint8_t type = 0;  // 1 player, 2 entity, 3 fake
};
class EnableNonOwnerReferences {
public:
    virtual ~EnableNonOwnerReferences() = default;
    std::shared_ptr<void> controlBlock;
};
class ObjectiveCriteria {
public:
    virtual ~ObjectiveCriteria() = default;
    std::string name = "dummy";
    bool readOnly = false;
    int renderType = 0;
};
class Objective : public EnableNonOwnerReferences {
public:
    std::unordered_map<ScoreboardId, int> scores;
    std::string name;
    std::string displayName;
    ObjectiveCriteria* criteria = nullptr;
};
struct DisplayObjective {
    const Objective* objective = nullptr;
    int sortOrder = 1;
};
class Scoreboard {
public:
    virtual ~Scoreboard() = default;
    void* softEnumRegistry[2]{};
    std::unordered_map<std::string, DisplayObjective> displayObjectives;
    std::unordered_map<int64_t, ScoreboardId> players, entities;
    std::unordered_map<std::string, ScoreboardId> fakes;
    std::unordered_map<ScoreboardId, IdentityDefinition> identityDefs;
    std::unordered_map<ScoreboardId, int> identityRefs;
    bool shouldUpdateUi = false;
    std::unordered_map<std::string, std::unique_ptr<Objective>> objectives;
    std::unordered_map<size_t, Objective*> lookup;
    std::unordered_map<std::string, std::unique_ptr<ObjectiveCriteria>> criteria;
};
class ClientScoreboard : public Scoreboard {
public:
    void* client = nullptr;
};

class Level : public ILevel {
public:
    char before[0x5A0]{};
#ifdef MOCK_ALT
    std::unique_ptr<LevelSubsystems> subsystems = std::make_unique<LevelSubsystems>();  // player list two levels deep
    std::unique_ptr<PlayerListManager>& playerListManagerRef() { return subsystems->plm; }
#else
    std::unique_ptr<PlayerListManager> playerListManager = std::make_unique<PlayerListManager>();
    std::unique_ptr<PlayerListManager>& playerListManagerRef() { return playerListManager; }
#endif
    void* plmCtrl = nullptr;
    std::unique_ptr<Scoreboard> scoreboard = std::make_unique<ClientScoreboard>();
    char after[0x300]{};
    int time = 6000;
    uint64_t currentTick = 0;
    int getTime() const override { return time; }
    void tick() override {
        currentTick++;
        time++;
    }
};
class ClientLevel : public Level {
public:
    bool clientSide = true;
};

// ---------------------------------------------------------------- actors
#ifdef MOCK_ALT
// layout drift: different member order
struct EntityContext {
    EnTTRegistry& enttRegistry;
    EntityId entity;
    EntityRegistry& registry;
    EntityContext(EntityRegistry& r, EnTTRegistry& er, EntityId e) : enttRegistry(er), entity(e), registry(r) {}
};
#else
struct EntityContext {
    EntityRegistry& registry;
    EnTTRegistry& enttRegistry;
    EntityId entity;
};
#endif
struct BuiltInActorComponents {
    StateVectorComponent* stateVector;
    AABBShapeComponent* aabb;
    ActorRotationComponent* rotation;
    ActorWalkAnimationComponent* walk;
};

class Actor {
public:
    explicit Actor(EntityContext ctx) : ctx_(ctx) {}
    virtual void outOfWorld() {}
    virtual void reloadHardcoded() {}
    virtual void reloadHardcodedClient() {}
    virtual void initializeComponents() {}
    virtual void reloadComponents() {}
    virtual void _serverInitItemStackIds() {}
    virtual void _doInitialMove() {}
    virtual bool hasComponent(const HashedString&) { return false; }
    virtual ~Actor() = default;
    virtual void resetUserPos(bool) {}
    virtual int getOwnerEntityType() { return 0; }
    virtual void remove() {}
    virtual Vec3 getFiringPos() const { return {}; }
    virtual float getInterpolatedBodyRot(float) const { return renderCalls_++, 0.f; }
    virtual float getInterpolatedHeadRot(float) const { return 0.f; }
    virtual float getInterpolatedBodyYaw(float) const { return 0.f; }
    virtual float getYawSpeedInDegreesPerSecond() const { return 0.f; }
    virtual void normalTick() { baseTick(); }
    virtual void baseTick() { tickCount_++; }
    virtual void passengerTick() {}
    virtual bool isInvisible() const { return false; }
    virtual void playerTouch(Actor&) {}
    virtual bool isImmobile() const { return false; }
    virtual bool isAlive() const { return true; }
    virtual void setSneaking(bool) {}

#ifdef MOCK_ALT
    char pad0[24]{};
#endif
    EntityContext ctx_;
    char initParams[72]{};
    std::string customInitEventName;
    uint8_t initMethod = 0;
    bool forceInit = false;
    bool added = true;
    int sendRateCounter = 0;
    void* definitions = nullptr;
    void* currentDescription = nullptr;
    std::shared_ptr<void> leashRope;
    std::string alias;
    char renderTransform[68]{};
    int lastHurtByPlayerTime = 0;
    char boneMatrices[24]{};
    char entityData[48]{};
    void* networkData = nullptr;
    Vec3 sentDelta{};
    float scale = 1, scalePrev = 1;
    char misc[64]{};
    int64_t legacyUniqueId = 0;
    Dimension* dimension_ = nullptr;
    void* dimensionCtrl_ = nullptr;
    ILevel* level_ = nullptr;
    HashedString rendererId;
    int categories = 0;
    unsigned version = 0;
    BuiltInActorComponents builtin{};
    char tail[0x200]{};
    mutable int renderCalls_ = 0;
    int tickCount_ = 0;
};

class Mob : public Actor {
public:
    using Actor::Actor;
    virtual void aiStep() {}
    float speed = 0.1f;
    char mobFields[0x180]{};
};
class Zombie : public Mob {
public:
    using Mob::Mob;
    void aiStep() override {}
};
class Cow : public Mob {
public:
    using Mob::Mob;
};
class ItemActor : public Actor {
public:
    using Actor::Actor;
    ItemStack stack;
};
class Player : public Mob {
public:
    using Mob::Mob;
    virtual void tickWorld(uint64_t) {}
    char playerFields[0x880]{};
    std::unique_ptr<PlayerInventory> inventory_ = std::make_unique<PlayerInventory>();
    char more[0x340]{};
    std::string name_;
    std::string deviceId_ = "device-1234";
    char rest[0x100]{};
};
class LocalPlayer : public Player {
public:
    using Player::Player;
    void normalTick() override {
        Player::normalTick();
        baseTick();
    }
    char localFields[0x200]{};
};
class RemotePlayer : public Player {
public:
    using Player::Player;
};

// ---------------------------------------------------------------- world
struct World {
    std::shared_ptr<EntityRegistry> reg = std::make_shared<EntityRegistry>();
    std::unique_ptr<ClientLevel> level = std::make_unique<ClientLevel>();
    std::unique_ptr<OverworldDimension> overworld = std::make_unique<OverworldDimension>();
    std::shared_ptr<BlockSource> blockSource = std::make_shared<BlockSource>();
    LocalPlayer* local = nullptr;
    std::vector<EntityId> entities;
    std::atomic<bool> running{true};
    int64_t nextUnique = 1;
    uint64_t nextRuntime = 1;
    std::vector<std::unique_ptr<Item>> items;
};
static World* g_world = nullptr;
static std::mutex g_mu;
static int g_generation = 0;
// a second LocalPlayer in its own registry, like a UI preview / paper doll
static std::shared_ptr<EntityRegistry> g_previewReg;
static LocalPlayer* g_preview = nullptr;
static std::atomic<uint64_t> g_ticks{0};

template <class T>
static T* spawn(const char* id, Vec3 pos, float height, float width, float heightOffset, int64_t uniqueId,
                const char* nameTag = nullptr) {
    World& w = *g_world;
    auto& r = w.reg->registry;
    EntityId e = r.create();
    EntityContext ctx{*w.reg, r, e};
    T* a = new T(ctx);
    r.emplace<ActorOwnerComponent>(e, std::unique_ptr<Actor>(a));
    auto& sv = r.emplace<StateVectorComponent>(e, StateVectorComponent{{pos.x, pos.y + heightOffset, pos.z}, {pos.x, pos.y + heightOffset, pos.z}, {0, 0, 0}});
    auto& bb = r.emplace<AABBShapeComponent>(
        e, AABBShapeComponent{{{pos.x - width / 2, pos.y, pos.z - width / 2}, {pos.x + width / 2, pos.y + height, pos.z + width / 2}}, {width, height}});
    auto& rot = r.emplace<ActorRotationComponent>(e, ActorRotationComponent{{10.f, 45.f}, {10.f, 45.f}});
    auto& walk = r.emplace<ActorWalkAnimationComponent>(e);
#ifdef MOCK_ALT
    (void)sv; (void)bb; (void)rot; (void)walk;
    a->builtin = {nullptr, nullptr, nullptr, nullptr};  // no cached component pointers
#else
    a->builtin = {&sv, &bb, &rot, &walk};
#endif
    std::string full = std::string("minecraft:") + id;
    r.emplace<ActorDefinitionIdentifierComponent>(e, ActorDefinitionIdentifierComponent{{"minecraft", id, "", full, HashedString(full)}});
    r.emplace<RuntimeIDComponent>(e, RuntimeIDComponent{w.nextRuntime++});
    r.emplace<ActorUniqueIDComponent>(e, ActorUniqueIDComponent{uniqueId});
    r.emplace<DimensionTypeComponent>(e, DimensionTypeComponent{0});
    r.emplace<ActorTypeComponent>(e, ActorTypeComponent{0x100 | 1});
    r.emplace<OffsetsComponent>(e, OffsetsComponent{heightOffset, 0, {}, {}, {}, {}, {}});
    r.emplace<MobBodyRotationComponent>(e, MobBodyRotationComponent{45.f, 45.f});
    r.emplace<ActorHeadRotationComponent>(e, ActorHeadRotationComponent{50.f, 50.f});
    r.emplace<OnGroundFlagComponent>(e);
    auto& sd = r.emplace<SynchedActorDataComponent>(e);
    sd.data.items.resize(8);
    sd.data.items[0] = std::make_unique<DataItem2<int64_t>>(DataItemType::Int64, 0, 0);
    sd.data.items[4] = std::make_unique<DataItem2<std::string>>(DataItemType::String, 4, nameTag ? nameTag : "");
    sd.data.items[7] = std::make_unique<DataItem2<short>>(DataItemType::Short, 7, (short)300);
    r.emplace<ActorDataFlagComponent>(e, ActorDataFlagComponent{{0, 0}});
    auto& at = r.emplace<AttributesComponent>(e);
    at.keys = {3, 7};
    at.values.emplace_back(&g_movement, 0.f, 1000.f, 0.1f);
    at.values.emplace_back(&g_health, 0.f, 20.f, 20.f);
    auto& bsc = r.emplace<BlockSourceComponent>(e);
    bsc.bs = w.blockSource;
    a->level_ = w.level.get();
    a->dimension_ = w.overworld.get();
    a->legacyUniqueId = uniqueId;
    a->rendererId = HashedString(full);
    w.entities.push_back(e);
    return a;
}

static void addPlayerToList(Player* p, const std::string& name, const std::string& xuid, int64_t uid) {
    PlayerListEntry ple;
    ple.id = uid;
    ple.uuid = mce::UUID{0x1234567800000000ULL | (uint64_t)uid, 0xabcdef0000000000ULL | (uint64_t)(uid * 7)};
    ple.name = name;
    ple.xuid = xuid;
    ple.platformOnlineId = "";
    g_world->level->playerListManagerRef()->list[ple.uuid] = ple;
}

static Player* spawnPlayer(bool local, const std::string& name, Vec3 feet, int64_t uid) {
    Player* p;
    if (local) p = spawn<LocalPlayer>("player", feet, 1.8f, 0.6f, 1.62001f, uid, name.c_str());
    else p = spawn<RemotePlayer>("player", feet, 1.8f, 0.6f, 1.62001f, uid, name.c_str());
    p->name_ = name;
    auto& r = g_world->reg->registry;
    EntityId e = p->ctx_.entity;
    r.emplace<PlayerComponent>(e);
    r.emplace<ActorGameTypeComponent>(e, ActorGameTypeComponent{local ? 1 : 0});
    addPlayerToList(p, name, "2535" + std::to_string(4000000000LL + uid), uid);
    // equipment + inventory
    auto& eq = r.emplace<ActorEquipmentComponent>(e);
    eq.hand = std::make_unique<SimpleContainer>(2);
    eq.armor = std::make_unique<SimpleContainer>(4);
    auto mkItem = [](const char* id) {
        auto it = std::make_unique<SwordItem>(id);
        Item* raw = it.get();
        g_world->items.push_back(std::move(it));
        auto* sc = new SharedCounter<Item>{raw};
        return sc;
    };
    eq.hand->items_[0].item = mkItem("diamond_sword");
    eq.hand->items_[0].count = 1;
    eq.armor->items_[1].item = mkItem("iron_chestplate");
    eq.armor->items_[1].count = 1;
    auto& inv = p->inventory_->inventory->items_;
    inv[0].item = mkItem("cobblestone");
    inv[0].count = 64;
    inv[2].item = mkItem("bread");
    inv[2].count = 12;
    return p;
}

static void despawn(EntityId e) {
    auto& r = g_world->reg->registry;
    r.destroy(e);
    auto& v = g_world->entities;
    v.erase(std::remove(v.begin(), v.end(), e), v.end());
}

static Actor* actorOf(EntityId e) { return g_world->reg->registry.get<ActorOwnerComponent>(e).actor.get(); }

static void gameLoop() {
    auto next = std::chrono::steady_clock::now();
    int t = 0;
    int gen = -1;
    EntityId item{};
    EntityId visitor{};
    while (g_world->running) {
        next += std::chrono::milliseconds(50);
        {
            std::lock_guard<std::mutex> lk(g_mu);
            if (gen != g_generation) {  // a new world was joined: reset the scenario
                gen = g_generation;
                t = 0;
                item = EntityId{};
                visitor = EntityId{};
            }
            auto& r = g_world->reg->registry;
            g_world->level->tick();
            for (auto e : g_world->entities) {
                Actor* a = actorOf(e);
                a->normalTick();  // virtual call through the vtable
                auto* sv = &r.get<StateVectorComponent>(e);
                auto* bb = &r.get<AABBShapeComponent>(e);
                sv->posPrev = sv->pos;
                if (dynamic_cast<Zombie*>(a)) {
                    sv->posDelta = {0.05f, 0, 0};
                    sv->pos.x += 0.05f;
                    bb->aabb.min.x += 0.05f;
                    bb->aabb.max.x += 0.05f;
                }
            }
            if (g_preview) g_preview->normalTick();
            // local player walks in a circle
            auto* lp = &r.get<StateVectorComponent>(g_world->local->ctx_.entity);
            float ang = t * 0.05f;
            lp->pos.x = 10 + std::cos(ang) * 3;
            lp->pos.z = 20 + std::sin(ang) * 3;
            r.get<ActorRotationComponent>(g_world->local->ctx_.entity).rot.y = std::fmod(t * 3.f, 360.f) - 180.f;
            // sneak flag toggles every 2 s
            r.get<ActorDataFlagComponent>(g_world->local->ctx_.entity).bits[0] = ((t / 40) % 2) ? 2 : 0;
            if (g_generation == 0) {
                // an item appears/disappears every 3 s
                if (t % 60 == 0) {
                    if (item.raw_ != ~0u && r.valid(item)) {
                        despawn(item);
                        item = EntityId{};
                    } else {
                        item = spawn<ItemActor>("item", {12, 64, 22}, 0.25f, 0.25f, 0.125f, -(int64_t)(1000 + t))->ctx_.entity;
                    }
                }
                // a remote player joins at t=100 and leaves at t=300
                if (t == 100) {
                    visitor = spawnPlayer(false, "Visitor_X", {30, 64, 30}, -12884901887LL)->ctx_.entity;
                }
                if (t == 300 && visitor.raw_ != ~0u) {
                    auto& list = g_world->level->playerListManagerRef()->list;
                    for (auto it = list.begin(); it != list.end(); ++it)
                        if (it->second.name == "Visitor_X") {
                            list.erase(it);
                            break;
                        }
                    despawn(visitor);
                    visitor = EntityId{};
                }
            }
            t++;
            g_ticks++;
        }
        std::this_thread::sleep_until(next);
    }
}

static void renderLoop() {
    // render thread: calls LocalPlayer virtuals at ~60 Hz (must not be picked as the tick)
    while (g_world->running) {
        {
            std::lock_guard<std::mutex> lk(g_mu);
            if (g_world->local) g_world->local->getInterpolatedBodyRot(0.5f);
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(16));
    }
}

static World* buildWorld(bool first) {
    g_world = new World();
    g_world->overworld->level = g_world->level.get();
    g_world->overworld->blockSource = g_world->blockSource;
    g_world->blockSource->dim = g_world->overworld.get();
    if (first) {
        // some noise entities first so the local player is not at index 0
        for (int i = 0; i < 5; i++) spawn<Cow>("cow", {float(i * 2), 64, 5}, 1.3f, 0.9f, 0.f, -(int64_t)(100 + i));
        g_world->local = static_cast<LocalPlayer*>(spawnPlayer(true, "Steve_Dev", {10, 64, 20}, -4294967295LL));
        for (int i = 0; i < 200; i++)
            spawn<Zombie>("zombie", {float(i % 20) * 3 - 20, 64, float(i / 20) * 3 - 10}, 1.9f, 0.6f, 0.f, -(int64_t)(200 + i));
        spawnPlayer(false, "Alex_Remote", {40, 70, -12}, -8589934591LL);
        // a player that is in the list but not loaded (out of render distance)
        PlayerListEntry far{};
        far.id = -99999;
        far.uuid = {0x99, 0x77};
        far.name = "FarAwayFriend";
        far.xuid = "2535999";
        g_world->level->playerListManagerRef()->list[far.uuid] = far;
        // scoreboard: a sidebar with fake players and a list objective with real players
        auto* sb = g_world->level->scoreboard.get();
        sb->criteria["dummy"] = std::make_unique<ObjectiveCriteria>();
        int64_t nextId = 1;
        auto addObjective = [&](const char* name, const char* display) {
            auto o = std::make_unique<Objective>();
            o->name = name;
            o->displayName = display;
            o->criteria = sb->criteria["dummy"].get();
            Objective* raw = o.get();
            sb->objectives[name] = std::move(o);
            return raw;
        };
        auto fake = [&](Objective* o, const char* name, int score) {
            ScoreboardId id{nextId++, nullptr};
            auto& def = sb->identityDefs[id];
            def.id = id;
            def.playerName = name;
            def.type = 3;
            id.def = &def;
            def.id.def = &def;
            sb->fakes[name] = id;
            o->scores[id] = score;
        };
        auto player = [&](Objective* o, int64_t uid, int score) {
            ScoreboardId id{nextId++, nullptr};
            auto& def = sb->identityDefs[id];
            def.id = id;
            def.playerId = uid;
            def.entityId = uid;
            def.type = 1;
            id.def = &def;
            def.id.def = &def;
            sb->players[uid] = id;
            o->scores[id] = score;
        };
        Objective* side = addObjective("sidebar_info", "§6My Server");
        fake(side, "Online: 3", 3);
        fake(side, "Coins: 1250", 2);
        fake(side, "play.example.net", 1);
        Objective* kills = addObjective("kills", "Kills");
        player(kills, -4294967295LL, 7);
        player(kills, -8589934591LL, 12);
        sb->displayObjectives["sidebar"] = DisplayObjective{side, 0};
        sb->displayObjectives["list"] = DisplayObjective{kills, 1};
    } else {
        // "another server": different entities, new registry, new LocalPlayer object
        for (int i = 0; i < 30; i++) spawn<Cow>("cow", {float(i), 70, 0}, 1.3f, 0.9f, 0.f, -(int64_t)(5000 + i));
        g_world->local = static_cast<LocalPlayer*>(spawnPlayer(true, "Steve_Dev", {0, 70, 0}, -77309411327LL));
        spawnPlayer(false, "Server2_Admin", {5, 70, 5}, -81604378623LL);
    }
    return g_world;
}

API void mock_start_game() {
    std::lock_guard<std::mutex> lk(g_mu);
    buildWorld(true);
    std::thread(gameLoop).detach();
    std::thread(renderLoop).detach();
}

// leave the world and join another one
API void mock_rejoin() {
    std::lock_guard<std::mutex> lk(g_mu);
    World* old = g_world;
    old->entities.clear();
    old->local = nullptr;
    buildWorld(false);
    g_generation++;
    old->reg->registry.clear();  // destroys every actor of the old world
    delete old;
}

API void mock_preview() {
    std::lock_guard<std::mutex> lk(g_mu);
    if (g_preview) return;
    g_previewReg = std::make_shared<EntityRegistry>();
    auto& r = g_previewReg->registry;
    EntityId e = r.create();
    EntityContext ctx{*g_previewReg, r, e};
    g_preview = new LocalPlayer(ctx);
    g_preview->name_ = "PreviewDoll";
    r.emplace<ActorOwnerComponent>(e, std::unique_ptr<Actor>(g_preview));
    r.emplace<StateVectorComponent>(e, StateVectorComponent{{0, 0, 0}, {0, 0, 0}, {0, 0, 0}});
}

API uint64_t mock_ticks() { return g_ticks.load(); }

API void* mock_local_player() { return g_world ? g_world->local : nullptr; }

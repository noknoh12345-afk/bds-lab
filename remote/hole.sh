# hole.sh <dir> <port> <depth> : a player standing still in a hole <depth> deep (0 = open ground) beside the dragon, 3 min
cd $1; v="say open"; [ $3 -gt 0 ] && v="execute as A at @s run fill ~ ~-$3 ~ ~ ~-1 ~ air"
L=("@A join" "wait 2000" "replaceitem entity A slot.armor.chest 0 iron_chestplate" "replaceitem entity A slot.armor.legs 0 iron_leggings" "replaceitem entity A slot.armor.feet 0 iron_boots" "replaceitem entity A slot.armor.head 0 carved_pumpkin" "effect A saturation 600 0 true" "execute in the_end run tp A ${4:-28} 64 ${5:-28}" "wait 5000" "$v" "wait 2000")
for i in $(seq 1 18); do L+=("wait 10000" "js (()=>{const a=p('A');return 'hp '+a.getComponent('health').currentValue.toFixed(1)})()"); done
r=$(LAB_PORT=$2 LAB_WORLD=normal LAB_SEED=11 timeout 300 node lab.mjs run -a lamp "${L[@]}" 2>&1 | grep -E "^hp|died" | tr '\n' ' ')
echo "depth $3 at ${4:-28},${5:-28}: alive $(echo "$r" | grep -o 'hp [1-9][0-9.]*' | wc -l)/18 checks · $(echo "$r" | grep -o 'died ([^)]*)' | head -1)" >> /tmp/hole.txt

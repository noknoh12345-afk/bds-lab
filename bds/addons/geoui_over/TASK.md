# GeoUI Property Limits

## Request
player の BP 定義にプロパティを33個宣言したとき、BDS がどう読むかを記録する（仕様書「1エンティティ型あたり32個まで」の確かめ）。

## Acceptance (one tests.txt `## ` section each)
- [x] 33個目は上限エラーになり、32個以内の分も含めてすべてのプロパティが読み込まれない

## Do not
- make this addon "pass" by removing the 33rd property: the failure is what it records

## Maintenance
- 2026-10-21 BDS 1.26.52.3: moved to stable APIs

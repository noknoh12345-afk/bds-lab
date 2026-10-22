import { createInterface } from 'node:readline';
function ask(question) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}
/** y/n 確認。接続直前の最後の関所。 */
export async function confirm(question) {
    return /^y(es)?$/i.test(await ask(`${question} [y/N]: `));
}
/** 番号選択。キャンセル(空/範囲外)なら -1 */
export async function choose(question, count) {
    const n = Number(await ask(`${question} [1-${count}]: `));
    return Number.isInteger(n) && n >= 1 && n <= count ? n - 1 : -1;
}

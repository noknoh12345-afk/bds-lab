class F { constructor() { return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => t) }); } show() { return Promise.resolve({ canceled: true, cancelationReason: 'UserClosed' }); } }
export class ActionFormData extends F {} export class ModalFormData extends F {} export class MessageFormData extends F {}
export const FormCancelationReason = { UserBusy: 'UserBusy', UserClosed: 'UserClosed' };

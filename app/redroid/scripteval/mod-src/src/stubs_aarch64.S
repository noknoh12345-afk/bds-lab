// Code templates copied into executable memory at runtime (AArch64).
// They are never executed in place.
#if defined(__aarch64__)
    .text

// ---------------------------------------------------------------------------
// Counting stub. Uses only x16/x17 (intra-procedure-call scratch registers).
// ---------------------------------------------------------------------------
    .globl se_count_stub_begin
    .hidden se_count_stub_begin
    .p2align 4
se_count_stub_begin:
    adr x16, .Lcnt_counter
    ldr x17, [x16, #24]
    cmp x0, x17                         // only count calls on the profiled object
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:
    ldr x16, [x16, #16]
    br x16
    .p2align 3
    .globl se_count_stub_counter
    .hidden se_count_stub_counter
se_count_stub_counter:
.Lcnt_counter: .quad 0
    .globl se_count_stub_thread
    .hidden se_count_stub_thread
se_count_stub_thread:
.Lcnt_thread: .quad 0
    .globl se_count_stub_orig
    .hidden se_count_stub_orig
se_count_stub_orig:
.Lcnt_orig: .quad 0
    .globl se_count_stub_target
    .hidden se_count_stub_target
se_count_stub_target:
.Lcnt_target: .quad 0
    .globl se_count_stub_end
    .hidden se_count_stub_end
se_count_stub_end:

// ---------------------------------------------------------------------------
// Pre-call hook: fn(self, cookie) then tail call the original.
// ---------------------------------------------------------------------------
    .globl se_pre_stub_begin
    .hidden se_pre_stub_begin
    .p2align 4
se_pre_stub_begin:
    stp x29, x30, [sp, #-16]!
    mov x29, sp
    sub sp, sp, #208
    stp x0, x1, [sp, #0]
    stp x2, x3, [sp, #16]
    stp x4, x5, [sp, #32]
    stp x6, x7, [sp, #48]
    str x8, [sp, #64]
    stp q0, q1, [sp, #80]
    stp q2, q3, [sp, #112]
    stp q4, q5, [sp, #144]
    stp q6, q7, [sp, #176]
    ldr x1, .Lpre_cookie
    ldr x16, .Lpre_fn
    blr x16
    ldp q6, q7, [sp, #176]
    ldp q4, q5, [sp, #144]
    ldp q2, q3, [sp, #112]
    ldp q0, q1, [sp, #80]
    ldr x8, [sp, #64]
    ldp x6, x7, [sp, #48]
    ldp x4, x5, [sp, #32]
    ldp x2, x3, [sp, #16]
    ldp x0, x1, [sp, #0]
    add sp, sp, #208
    ldp x29, x30, [sp], #16
    ldr x16, .Lpre_orig
    br x16
    .p2align 3
    .globl se_pre_stub_fn
    .hidden se_pre_stub_fn
se_pre_stub_fn:
.Lpre_fn: .quad 0
    .globl se_pre_stub_cookie
    .hidden se_pre_stub_cookie
se_pre_stub_cookie:
.Lpre_cookie: .quad 0
    .globl se_pre_stub_orig
    .hidden se_pre_stub_orig
se_pre_stub_orig:
.Lpre_orig: .quad 0
    .globl se_pre_stub_end
    .hidden se_pre_stub_end
se_pre_stub_end:

    .section .note.GNU-stack,"",%progbits
#endif

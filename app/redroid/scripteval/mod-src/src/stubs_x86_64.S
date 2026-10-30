// Code templates copied into executable memory at runtime.
// They are never executed in place.
#if defined(__x86_64__)
    .text

// ---------------------------------------------------------------------------
// Counting stub: counts calls whose `this` (rdi) is the profiled object,
// remembers the calling thread, then tail-jumps to the original function.
// Clobbers only r11 (scratch, never an argument) and the flags.
// ---------------------------------------------------------------------------
    .globl se_count_stub_begin
    .hidden se_count_stub_begin
    .p2align 4
se_count_stub_begin:
    cmpq .Lcnt_target(%rip), %rdi       // only count calls on the object we profile
    jne 1f
    lock incq .Lcnt_counter(%rip)
    movq %fs:0, %r11
    movq %r11, .Lcnt_thread(%rip)
1:
    jmpq *.Lcnt_orig(%rip)
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
// Pre-call hook: saves every argument register, calls fn(self, cookie),
// restores the registers and tail-jumps to the original function, so the
// hooked function behaves exactly as before (same arguments, same return).
// ---------------------------------------------------------------------------
    .globl se_pre_stub_begin
    .hidden se_pre_stub_begin
    .p2align 4
se_pre_stub_begin:
    pushq %rdi
    pushq %rsi
    pushq %rdx
    pushq %rcx
    pushq %r8
    pushq %r9
    pushq %rax
    pushq %r10
    subq $136, %rsp
    movdqu %xmm0, 0(%rsp)
    movdqu %xmm1, 16(%rsp)
    movdqu %xmm2, 32(%rsp)
    movdqu %xmm3, 48(%rsp)
    movdqu %xmm4, 64(%rsp)
    movdqu %xmm5, 80(%rsp)
    movdqu %xmm6, 96(%rsp)
    movdqu %xmm7, 112(%rsp)
    movq .Lpre_cookie(%rip), %rsi
    callq *.Lpre_fn(%rip)
    movdqu 0(%rsp), %xmm0
    movdqu 16(%rsp), %xmm1
    movdqu 32(%rsp), %xmm2
    movdqu 48(%rsp), %xmm3
    movdqu 64(%rsp), %xmm4
    movdqu 80(%rsp), %xmm5
    movdqu 96(%rsp), %xmm6
    movdqu 112(%rsp), %xmm7
    addq $136, %rsp
    popq %r10
    popq %rax
    popq %r9
    popq %r8
    popq %rcx
    popq %rdx
    popq %rsi
    popq %rdi
    jmpq *.Lpre_orig(%rip)
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

    .section .note.GNU-stack,"",@progbits
#endif

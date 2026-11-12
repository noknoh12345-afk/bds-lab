// Static (pre-assembled) copies of the stubs. Used when the platform refuses
// to create new executable memory (macOS on Apple Silicon: RWX mmap without
// MAP_JIT fails). Their data lives in .bss, reached with adrp/add.
#if defined(__aarch64__)
    .bss
    .p2align 6
    .globl se_static_count_data
    .hidden se_static_count_data
se_static_count_data:
    .zero 1024*32
    .globl se_static_pre_data
    .hidden se_static_pre_data
se_static_pre_data:
    .zero 32

    .text
    .p2align 6
    .globl se_static_count_stubs
    .hidden se_static_count_stubs
se_static_count_stubs:
    adrp x16, se_static_count_data+0
    add x16, x16, :lo12:se_static_count_data+0
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+32
    add x16, x16, :lo12:se_static_count_data+32
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+64
    add x16, x16, :lo12:se_static_count_data+64
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+96
    add x16, x16, :lo12:se_static_count_data+96
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+128
    add x16, x16, :lo12:se_static_count_data+128
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+160
    add x16, x16, :lo12:se_static_count_data+160
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+192
    add x16, x16, :lo12:se_static_count_data+192
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+224
    add x16, x16, :lo12:se_static_count_data+224
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+256
    add x16, x16, :lo12:se_static_count_data+256
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+288
    add x16, x16, :lo12:se_static_count_data+288
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+320
    add x16, x16, :lo12:se_static_count_data+320
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+352
    add x16, x16, :lo12:se_static_count_data+352
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+384
    add x16, x16, :lo12:se_static_count_data+384
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+416
    add x16, x16, :lo12:se_static_count_data+416
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+448
    add x16, x16, :lo12:se_static_count_data+448
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+480
    add x16, x16, :lo12:se_static_count_data+480
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+512
    add x16, x16, :lo12:se_static_count_data+512
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+544
    add x16, x16, :lo12:se_static_count_data+544
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+576
    add x16, x16, :lo12:se_static_count_data+576
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+608
    add x16, x16, :lo12:se_static_count_data+608
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+640
    add x16, x16, :lo12:se_static_count_data+640
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+672
    add x16, x16, :lo12:se_static_count_data+672
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+704
    add x16, x16, :lo12:se_static_count_data+704
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+736
    add x16, x16, :lo12:se_static_count_data+736
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+768
    add x16, x16, :lo12:se_static_count_data+768
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+800
    add x16, x16, :lo12:se_static_count_data+800
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+832
    add x16, x16, :lo12:se_static_count_data+832
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+864
    add x16, x16, :lo12:se_static_count_data+864
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+896
    add x16, x16, :lo12:se_static_count_data+896
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+928
    add x16, x16, :lo12:se_static_count_data+928
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+960
    add x16, x16, :lo12:se_static_count_data+960
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+992
    add x16, x16, :lo12:se_static_count_data+992
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+1024
    add x16, x16, :lo12:se_static_count_data+1024
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+1056
    add x16, x16, :lo12:se_static_count_data+1056
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+1088
    add x16, x16, :lo12:se_static_count_data+1088
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+1120
    add x16, x16, :lo12:se_static_count_data+1120
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+1152
    add x16, x16, :lo12:se_static_count_data+1152
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+1184
    add x16, x16, :lo12:se_static_count_data+1184
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+1216
    add x16, x16, :lo12:se_static_count_data+1216
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+1248
    add x16, x16, :lo12:se_static_count_data+1248
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+1280
    add x16, x16, :lo12:se_static_count_data+1280
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+1312
    add x16, x16, :lo12:se_static_count_data+1312
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+1344
    add x16, x16, :lo12:se_static_count_data+1344
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+1376
    add x16, x16, :lo12:se_static_count_data+1376
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+1408
    add x16, x16, :lo12:se_static_count_data+1408
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+1440
    add x16, x16, :lo12:se_static_count_data+1440
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+1472
    add x16, x16, :lo12:se_static_count_data+1472
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+1504
    add x16, x16, :lo12:se_static_count_data+1504
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+1536
    add x16, x16, :lo12:se_static_count_data+1536
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+1568
    add x16, x16, :lo12:se_static_count_data+1568
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+1600
    add x16, x16, :lo12:se_static_count_data+1600
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+1632
    add x16, x16, :lo12:se_static_count_data+1632
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+1664
    add x16, x16, :lo12:se_static_count_data+1664
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+1696
    add x16, x16, :lo12:se_static_count_data+1696
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+1728
    add x16, x16, :lo12:se_static_count_data+1728
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+1760
    add x16, x16, :lo12:se_static_count_data+1760
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+1792
    add x16, x16, :lo12:se_static_count_data+1792
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+1824
    add x16, x16, :lo12:se_static_count_data+1824
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+1856
    add x16, x16, :lo12:se_static_count_data+1856
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+1888
    add x16, x16, :lo12:se_static_count_data+1888
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+1920
    add x16, x16, :lo12:se_static_count_data+1920
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+1952
    add x16, x16, :lo12:se_static_count_data+1952
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+1984
    add x16, x16, :lo12:se_static_count_data+1984
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+2016
    add x16, x16, :lo12:se_static_count_data+2016
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+2048
    add x16, x16, :lo12:se_static_count_data+2048
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+2080
    add x16, x16, :lo12:se_static_count_data+2080
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+2112
    add x16, x16, :lo12:se_static_count_data+2112
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+2144
    add x16, x16, :lo12:se_static_count_data+2144
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+2176
    add x16, x16, :lo12:se_static_count_data+2176
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+2208
    add x16, x16, :lo12:se_static_count_data+2208
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+2240
    add x16, x16, :lo12:se_static_count_data+2240
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+2272
    add x16, x16, :lo12:se_static_count_data+2272
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+2304
    add x16, x16, :lo12:se_static_count_data+2304
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+2336
    add x16, x16, :lo12:se_static_count_data+2336
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+2368
    add x16, x16, :lo12:se_static_count_data+2368
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+2400
    add x16, x16, :lo12:se_static_count_data+2400
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+2432
    add x16, x16, :lo12:se_static_count_data+2432
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+2464
    add x16, x16, :lo12:se_static_count_data+2464
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+2496
    add x16, x16, :lo12:se_static_count_data+2496
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+2528
    add x16, x16, :lo12:se_static_count_data+2528
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+2560
    add x16, x16, :lo12:se_static_count_data+2560
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+2592
    add x16, x16, :lo12:se_static_count_data+2592
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+2624
    add x16, x16, :lo12:se_static_count_data+2624
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+2656
    add x16, x16, :lo12:se_static_count_data+2656
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+2688
    add x16, x16, :lo12:se_static_count_data+2688
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+2720
    add x16, x16, :lo12:se_static_count_data+2720
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+2752
    add x16, x16, :lo12:se_static_count_data+2752
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+2784
    add x16, x16, :lo12:se_static_count_data+2784
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+2816
    add x16, x16, :lo12:se_static_count_data+2816
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+2848
    add x16, x16, :lo12:se_static_count_data+2848
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+2880
    add x16, x16, :lo12:se_static_count_data+2880
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+2912
    add x16, x16, :lo12:se_static_count_data+2912
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+2944
    add x16, x16, :lo12:se_static_count_data+2944
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+2976
    add x16, x16, :lo12:se_static_count_data+2976
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+3008
    add x16, x16, :lo12:se_static_count_data+3008
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+3040
    add x16, x16, :lo12:se_static_count_data+3040
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+3072
    add x16, x16, :lo12:se_static_count_data+3072
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+3104
    add x16, x16, :lo12:se_static_count_data+3104
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+3136
    add x16, x16, :lo12:se_static_count_data+3136
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+3168
    add x16, x16, :lo12:se_static_count_data+3168
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+3200
    add x16, x16, :lo12:se_static_count_data+3200
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+3232
    add x16, x16, :lo12:se_static_count_data+3232
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+3264
    add x16, x16, :lo12:se_static_count_data+3264
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+3296
    add x16, x16, :lo12:se_static_count_data+3296
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+3328
    add x16, x16, :lo12:se_static_count_data+3328
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+3360
    add x16, x16, :lo12:se_static_count_data+3360
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+3392
    add x16, x16, :lo12:se_static_count_data+3392
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+3424
    add x16, x16, :lo12:se_static_count_data+3424
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+3456
    add x16, x16, :lo12:se_static_count_data+3456
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+3488
    add x16, x16, :lo12:se_static_count_data+3488
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+3520
    add x16, x16, :lo12:se_static_count_data+3520
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+3552
    add x16, x16, :lo12:se_static_count_data+3552
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+3584
    add x16, x16, :lo12:se_static_count_data+3584
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+3616
    add x16, x16, :lo12:se_static_count_data+3616
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+3648
    add x16, x16, :lo12:se_static_count_data+3648
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+3680
    add x16, x16, :lo12:se_static_count_data+3680
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+3712
    add x16, x16, :lo12:se_static_count_data+3712
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+3744
    add x16, x16, :lo12:se_static_count_data+3744
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+3776
    add x16, x16, :lo12:se_static_count_data+3776
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+3808
    add x16, x16, :lo12:se_static_count_data+3808
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+3840
    add x16, x16, :lo12:se_static_count_data+3840
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+3872
    add x16, x16, :lo12:se_static_count_data+3872
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+3904
    add x16, x16, :lo12:se_static_count_data+3904
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+3936
    add x16, x16, :lo12:se_static_count_data+3936
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+3968
    add x16, x16, :lo12:se_static_count_data+3968
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+4000
    add x16, x16, :lo12:se_static_count_data+4000
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+4032
    add x16, x16, :lo12:se_static_count_data+4032
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+4064
    add x16, x16, :lo12:se_static_count_data+4064
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+4096
    add x16, x16, :lo12:se_static_count_data+4096
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+4128
    add x16, x16, :lo12:se_static_count_data+4128
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+4160
    add x16, x16, :lo12:se_static_count_data+4160
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+4192
    add x16, x16, :lo12:se_static_count_data+4192
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+4224
    add x16, x16, :lo12:se_static_count_data+4224
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+4256
    add x16, x16, :lo12:se_static_count_data+4256
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+4288
    add x16, x16, :lo12:se_static_count_data+4288
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+4320
    add x16, x16, :lo12:se_static_count_data+4320
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+4352
    add x16, x16, :lo12:se_static_count_data+4352
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+4384
    add x16, x16, :lo12:se_static_count_data+4384
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+4416
    add x16, x16, :lo12:se_static_count_data+4416
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+4448
    add x16, x16, :lo12:se_static_count_data+4448
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+4480
    add x16, x16, :lo12:se_static_count_data+4480
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+4512
    add x16, x16, :lo12:se_static_count_data+4512
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+4544
    add x16, x16, :lo12:se_static_count_data+4544
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+4576
    add x16, x16, :lo12:se_static_count_data+4576
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+4608
    add x16, x16, :lo12:se_static_count_data+4608
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+4640
    add x16, x16, :lo12:se_static_count_data+4640
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+4672
    add x16, x16, :lo12:se_static_count_data+4672
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+4704
    add x16, x16, :lo12:se_static_count_data+4704
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+4736
    add x16, x16, :lo12:se_static_count_data+4736
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+4768
    add x16, x16, :lo12:se_static_count_data+4768
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+4800
    add x16, x16, :lo12:se_static_count_data+4800
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+4832
    add x16, x16, :lo12:se_static_count_data+4832
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+4864
    add x16, x16, :lo12:se_static_count_data+4864
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+4896
    add x16, x16, :lo12:se_static_count_data+4896
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+4928
    add x16, x16, :lo12:se_static_count_data+4928
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+4960
    add x16, x16, :lo12:se_static_count_data+4960
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+4992
    add x16, x16, :lo12:se_static_count_data+4992
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+5024
    add x16, x16, :lo12:se_static_count_data+5024
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+5056
    add x16, x16, :lo12:se_static_count_data+5056
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+5088
    add x16, x16, :lo12:se_static_count_data+5088
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+5120
    add x16, x16, :lo12:se_static_count_data+5120
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+5152
    add x16, x16, :lo12:se_static_count_data+5152
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+5184
    add x16, x16, :lo12:se_static_count_data+5184
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+5216
    add x16, x16, :lo12:se_static_count_data+5216
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+5248
    add x16, x16, :lo12:se_static_count_data+5248
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+5280
    add x16, x16, :lo12:se_static_count_data+5280
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+5312
    add x16, x16, :lo12:se_static_count_data+5312
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+5344
    add x16, x16, :lo12:se_static_count_data+5344
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+5376
    add x16, x16, :lo12:se_static_count_data+5376
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+5408
    add x16, x16, :lo12:se_static_count_data+5408
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+5440
    add x16, x16, :lo12:se_static_count_data+5440
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+5472
    add x16, x16, :lo12:se_static_count_data+5472
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+5504
    add x16, x16, :lo12:se_static_count_data+5504
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+5536
    add x16, x16, :lo12:se_static_count_data+5536
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+5568
    add x16, x16, :lo12:se_static_count_data+5568
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+5600
    add x16, x16, :lo12:se_static_count_data+5600
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+5632
    add x16, x16, :lo12:se_static_count_data+5632
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+5664
    add x16, x16, :lo12:se_static_count_data+5664
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+5696
    add x16, x16, :lo12:se_static_count_data+5696
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+5728
    add x16, x16, :lo12:se_static_count_data+5728
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+5760
    add x16, x16, :lo12:se_static_count_data+5760
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+5792
    add x16, x16, :lo12:se_static_count_data+5792
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+5824
    add x16, x16, :lo12:se_static_count_data+5824
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+5856
    add x16, x16, :lo12:se_static_count_data+5856
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+5888
    add x16, x16, :lo12:se_static_count_data+5888
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+5920
    add x16, x16, :lo12:se_static_count_data+5920
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+5952
    add x16, x16, :lo12:se_static_count_data+5952
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+5984
    add x16, x16, :lo12:se_static_count_data+5984
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+6016
    add x16, x16, :lo12:se_static_count_data+6016
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+6048
    add x16, x16, :lo12:se_static_count_data+6048
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+6080
    add x16, x16, :lo12:se_static_count_data+6080
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+6112
    add x16, x16, :lo12:se_static_count_data+6112
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+6144
    add x16, x16, :lo12:se_static_count_data+6144
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+6176
    add x16, x16, :lo12:se_static_count_data+6176
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+6208
    add x16, x16, :lo12:se_static_count_data+6208
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+6240
    add x16, x16, :lo12:se_static_count_data+6240
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+6272
    add x16, x16, :lo12:se_static_count_data+6272
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+6304
    add x16, x16, :lo12:se_static_count_data+6304
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+6336
    add x16, x16, :lo12:se_static_count_data+6336
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+6368
    add x16, x16, :lo12:se_static_count_data+6368
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+6400
    add x16, x16, :lo12:se_static_count_data+6400
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+6432
    add x16, x16, :lo12:se_static_count_data+6432
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+6464
    add x16, x16, :lo12:se_static_count_data+6464
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+6496
    add x16, x16, :lo12:se_static_count_data+6496
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+6528
    add x16, x16, :lo12:se_static_count_data+6528
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+6560
    add x16, x16, :lo12:se_static_count_data+6560
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+6592
    add x16, x16, :lo12:se_static_count_data+6592
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+6624
    add x16, x16, :lo12:se_static_count_data+6624
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+6656
    add x16, x16, :lo12:se_static_count_data+6656
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+6688
    add x16, x16, :lo12:se_static_count_data+6688
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+6720
    add x16, x16, :lo12:se_static_count_data+6720
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+6752
    add x16, x16, :lo12:se_static_count_data+6752
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+6784
    add x16, x16, :lo12:se_static_count_data+6784
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+6816
    add x16, x16, :lo12:se_static_count_data+6816
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+6848
    add x16, x16, :lo12:se_static_count_data+6848
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+6880
    add x16, x16, :lo12:se_static_count_data+6880
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+6912
    add x16, x16, :lo12:se_static_count_data+6912
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+6944
    add x16, x16, :lo12:se_static_count_data+6944
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+6976
    add x16, x16, :lo12:se_static_count_data+6976
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+7008
    add x16, x16, :lo12:se_static_count_data+7008
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+7040
    add x16, x16, :lo12:se_static_count_data+7040
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+7072
    add x16, x16, :lo12:se_static_count_data+7072
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+7104
    add x16, x16, :lo12:se_static_count_data+7104
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+7136
    add x16, x16, :lo12:se_static_count_data+7136
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+7168
    add x16, x16, :lo12:se_static_count_data+7168
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+7200
    add x16, x16, :lo12:se_static_count_data+7200
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+7232
    add x16, x16, :lo12:se_static_count_data+7232
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+7264
    add x16, x16, :lo12:se_static_count_data+7264
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+7296
    add x16, x16, :lo12:se_static_count_data+7296
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+7328
    add x16, x16, :lo12:se_static_count_data+7328
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+7360
    add x16, x16, :lo12:se_static_count_data+7360
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+7392
    add x16, x16, :lo12:se_static_count_data+7392
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+7424
    add x16, x16, :lo12:se_static_count_data+7424
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+7456
    add x16, x16, :lo12:se_static_count_data+7456
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+7488
    add x16, x16, :lo12:se_static_count_data+7488
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+7520
    add x16, x16, :lo12:se_static_count_data+7520
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+7552
    add x16, x16, :lo12:se_static_count_data+7552
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+7584
    add x16, x16, :lo12:se_static_count_data+7584
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+7616
    add x16, x16, :lo12:se_static_count_data+7616
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+7648
    add x16, x16, :lo12:se_static_count_data+7648
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+7680
    add x16, x16, :lo12:se_static_count_data+7680
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+7712
    add x16, x16, :lo12:se_static_count_data+7712
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+7744
    add x16, x16, :lo12:se_static_count_data+7744
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+7776
    add x16, x16, :lo12:se_static_count_data+7776
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+7808
    add x16, x16, :lo12:se_static_count_data+7808
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+7840
    add x16, x16, :lo12:se_static_count_data+7840
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+7872
    add x16, x16, :lo12:se_static_count_data+7872
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+7904
    add x16, x16, :lo12:se_static_count_data+7904
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+7936
    add x16, x16, :lo12:se_static_count_data+7936
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+7968
    add x16, x16, :lo12:se_static_count_data+7968
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+8000
    add x16, x16, :lo12:se_static_count_data+8000
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+8032
    add x16, x16, :lo12:se_static_count_data+8032
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+8064
    add x16, x16, :lo12:se_static_count_data+8064
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+8096
    add x16, x16, :lo12:se_static_count_data+8096
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+8128
    add x16, x16, :lo12:se_static_count_data+8128
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+8160
    add x16, x16, :lo12:se_static_count_data+8160
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+8192
    add x16, x16, :lo12:se_static_count_data+8192
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+8224
    add x16, x16, :lo12:se_static_count_data+8224
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+8256
    add x16, x16, :lo12:se_static_count_data+8256
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+8288
    add x16, x16, :lo12:se_static_count_data+8288
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+8320
    add x16, x16, :lo12:se_static_count_data+8320
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+8352
    add x16, x16, :lo12:se_static_count_data+8352
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+8384
    add x16, x16, :lo12:se_static_count_data+8384
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+8416
    add x16, x16, :lo12:se_static_count_data+8416
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+8448
    add x16, x16, :lo12:se_static_count_data+8448
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+8480
    add x16, x16, :lo12:se_static_count_data+8480
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+8512
    add x16, x16, :lo12:se_static_count_data+8512
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+8544
    add x16, x16, :lo12:se_static_count_data+8544
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+8576
    add x16, x16, :lo12:se_static_count_data+8576
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+8608
    add x16, x16, :lo12:se_static_count_data+8608
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+8640
    add x16, x16, :lo12:se_static_count_data+8640
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+8672
    add x16, x16, :lo12:se_static_count_data+8672
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+8704
    add x16, x16, :lo12:se_static_count_data+8704
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+8736
    add x16, x16, :lo12:se_static_count_data+8736
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+8768
    add x16, x16, :lo12:se_static_count_data+8768
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+8800
    add x16, x16, :lo12:se_static_count_data+8800
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+8832
    add x16, x16, :lo12:se_static_count_data+8832
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+8864
    add x16, x16, :lo12:se_static_count_data+8864
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+8896
    add x16, x16, :lo12:se_static_count_data+8896
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+8928
    add x16, x16, :lo12:se_static_count_data+8928
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+8960
    add x16, x16, :lo12:se_static_count_data+8960
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+8992
    add x16, x16, :lo12:se_static_count_data+8992
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+9024
    add x16, x16, :lo12:se_static_count_data+9024
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+9056
    add x16, x16, :lo12:se_static_count_data+9056
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+9088
    add x16, x16, :lo12:se_static_count_data+9088
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+9120
    add x16, x16, :lo12:se_static_count_data+9120
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+9152
    add x16, x16, :lo12:se_static_count_data+9152
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+9184
    add x16, x16, :lo12:se_static_count_data+9184
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+9216
    add x16, x16, :lo12:se_static_count_data+9216
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+9248
    add x16, x16, :lo12:se_static_count_data+9248
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+9280
    add x16, x16, :lo12:se_static_count_data+9280
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+9312
    add x16, x16, :lo12:se_static_count_data+9312
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+9344
    add x16, x16, :lo12:se_static_count_data+9344
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+9376
    add x16, x16, :lo12:se_static_count_data+9376
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+9408
    add x16, x16, :lo12:se_static_count_data+9408
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+9440
    add x16, x16, :lo12:se_static_count_data+9440
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+9472
    add x16, x16, :lo12:se_static_count_data+9472
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+9504
    add x16, x16, :lo12:se_static_count_data+9504
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+9536
    add x16, x16, :lo12:se_static_count_data+9536
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+9568
    add x16, x16, :lo12:se_static_count_data+9568
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+9600
    add x16, x16, :lo12:se_static_count_data+9600
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+9632
    add x16, x16, :lo12:se_static_count_data+9632
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+9664
    add x16, x16, :lo12:se_static_count_data+9664
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+9696
    add x16, x16, :lo12:se_static_count_data+9696
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+9728
    add x16, x16, :lo12:se_static_count_data+9728
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+9760
    add x16, x16, :lo12:se_static_count_data+9760
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+9792
    add x16, x16, :lo12:se_static_count_data+9792
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+9824
    add x16, x16, :lo12:se_static_count_data+9824
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+9856
    add x16, x16, :lo12:se_static_count_data+9856
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+9888
    add x16, x16, :lo12:se_static_count_data+9888
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+9920
    add x16, x16, :lo12:se_static_count_data+9920
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+9952
    add x16, x16, :lo12:se_static_count_data+9952
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+9984
    add x16, x16, :lo12:se_static_count_data+9984
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+10016
    add x16, x16, :lo12:se_static_count_data+10016
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+10048
    add x16, x16, :lo12:se_static_count_data+10048
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+10080
    add x16, x16, :lo12:se_static_count_data+10080
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+10112
    add x16, x16, :lo12:se_static_count_data+10112
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+10144
    add x16, x16, :lo12:se_static_count_data+10144
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+10176
    add x16, x16, :lo12:se_static_count_data+10176
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+10208
    add x16, x16, :lo12:se_static_count_data+10208
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+10240
    add x16, x16, :lo12:se_static_count_data+10240
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+10272
    add x16, x16, :lo12:se_static_count_data+10272
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+10304
    add x16, x16, :lo12:se_static_count_data+10304
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+10336
    add x16, x16, :lo12:se_static_count_data+10336
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+10368
    add x16, x16, :lo12:se_static_count_data+10368
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+10400
    add x16, x16, :lo12:se_static_count_data+10400
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+10432
    add x16, x16, :lo12:se_static_count_data+10432
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+10464
    add x16, x16, :lo12:se_static_count_data+10464
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+10496
    add x16, x16, :lo12:se_static_count_data+10496
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+10528
    add x16, x16, :lo12:se_static_count_data+10528
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+10560
    add x16, x16, :lo12:se_static_count_data+10560
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+10592
    add x16, x16, :lo12:se_static_count_data+10592
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+10624
    add x16, x16, :lo12:se_static_count_data+10624
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+10656
    add x16, x16, :lo12:se_static_count_data+10656
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+10688
    add x16, x16, :lo12:se_static_count_data+10688
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+10720
    add x16, x16, :lo12:se_static_count_data+10720
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+10752
    add x16, x16, :lo12:se_static_count_data+10752
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+10784
    add x16, x16, :lo12:se_static_count_data+10784
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+10816
    add x16, x16, :lo12:se_static_count_data+10816
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+10848
    add x16, x16, :lo12:se_static_count_data+10848
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+10880
    add x16, x16, :lo12:se_static_count_data+10880
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+10912
    add x16, x16, :lo12:se_static_count_data+10912
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+10944
    add x16, x16, :lo12:se_static_count_data+10944
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+10976
    add x16, x16, :lo12:se_static_count_data+10976
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+11008
    add x16, x16, :lo12:se_static_count_data+11008
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+11040
    add x16, x16, :lo12:se_static_count_data+11040
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+11072
    add x16, x16, :lo12:se_static_count_data+11072
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+11104
    add x16, x16, :lo12:se_static_count_data+11104
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+11136
    add x16, x16, :lo12:se_static_count_data+11136
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+11168
    add x16, x16, :lo12:se_static_count_data+11168
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+11200
    add x16, x16, :lo12:se_static_count_data+11200
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+11232
    add x16, x16, :lo12:se_static_count_data+11232
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+11264
    add x16, x16, :lo12:se_static_count_data+11264
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+11296
    add x16, x16, :lo12:se_static_count_data+11296
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+11328
    add x16, x16, :lo12:se_static_count_data+11328
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+11360
    add x16, x16, :lo12:se_static_count_data+11360
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+11392
    add x16, x16, :lo12:se_static_count_data+11392
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+11424
    add x16, x16, :lo12:se_static_count_data+11424
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+11456
    add x16, x16, :lo12:se_static_count_data+11456
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+11488
    add x16, x16, :lo12:se_static_count_data+11488
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+11520
    add x16, x16, :lo12:se_static_count_data+11520
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+11552
    add x16, x16, :lo12:se_static_count_data+11552
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+11584
    add x16, x16, :lo12:se_static_count_data+11584
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+11616
    add x16, x16, :lo12:se_static_count_data+11616
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+11648
    add x16, x16, :lo12:se_static_count_data+11648
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+11680
    add x16, x16, :lo12:se_static_count_data+11680
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+11712
    add x16, x16, :lo12:se_static_count_data+11712
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+11744
    add x16, x16, :lo12:se_static_count_data+11744
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+11776
    add x16, x16, :lo12:se_static_count_data+11776
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+11808
    add x16, x16, :lo12:se_static_count_data+11808
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+11840
    add x16, x16, :lo12:se_static_count_data+11840
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+11872
    add x16, x16, :lo12:se_static_count_data+11872
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+11904
    add x16, x16, :lo12:se_static_count_data+11904
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+11936
    add x16, x16, :lo12:se_static_count_data+11936
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+11968
    add x16, x16, :lo12:se_static_count_data+11968
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+12000
    add x16, x16, :lo12:se_static_count_data+12000
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+12032
    add x16, x16, :lo12:se_static_count_data+12032
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+12064
    add x16, x16, :lo12:se_static_count_data+12064
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+12096
    add x16, x16, :lo12:se_static_count_data+12096
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+12128
    add x16, x16, :lo12:se_static_count_data+12128
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+12160
    add x16, x16, :lo12:se_static_count_data+12160
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+12192
    add x16, x16, :lo12:se_static_count_data+12192
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+12224
    add x16, x16, :lo12:se_static_count_data+12224
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+12256
    add x16, x16, :lo12:se_static_count_data+12256
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+12288
    add x16, x16, :lo12:se_static_count_data+12288
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+12320
    add x16, x16, :lo12:se_static_count_data+12320
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+12352
    add x16, x16, :lo12:se_static_count_data+12352
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+12384
    add x16, x16, :lo12:se_static_count_data+12384
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+12416
    add x16, x16, :lo12:se_static_count_data+12416
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+12448
    add x16, x16, :lo12:se_static_count_data+12448
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+12480
    add x16, x16, :lo12:se_static_count_data+12480
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+12512
    add x16, x16, :lo12:se_static_count_data+12512
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+12544
    add x16, x16, :lo12:se_static_count_data+12544
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+12576
    add x16, x16, :lo12:se_static_count_data+12576
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+12608
    add x16, x16, :lo12:se_static_count_data+12608
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+12640
    add x16, x16, :lo12:se_static_count_data+12640
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+12672
    add x16, x16, :lo12:se_static_count_data+12672
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+12704
    add x16, x16, :lo12:se_static_count_data+12704
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+12736
    add x16, x16, :lo12:se_static_count_data+12736
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+12768
    add x16, x16, :lo12:se_static_count_data+12768
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+12800
    add x16, x16, :lo12:se_static_count_data+12800
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+12832
    add x16, x16, :lo12:se_static_count_data+12832
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+12864
    add x16, x16, :lo12:se_static_count_data+12864
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+12896
    add x16, x16, :lo12:se_static_count_data+12896
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+12928
    add x16, x16, :lo12:se_static_count_data+12928
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+12960
    add x16, x16, :lo12:se_static_count_data+12960
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+12992
    add x16, x16, :lo12:se_static_count_data+12992
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+13024
    add x16, x16, :lo12:se_static_count_data+13024
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+13056
    add x16, x16, :lo12:se_static_count_data+13056
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+13088
    add x16, x16, :lo12:se_static_count_data+13088
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+13120
    add x16, x16, :lo12:se_static_count_data+13120
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+13152
    add x16, x16, :lo12:se_static_count_data+13152
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+13184
    add x16, x16, :lo12:se_static_count_data+13184
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+13216
    add x16, x16, :lo12:se_static_count_data+13216
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+13248
    add x16, x16, :lo12:se_static_count_data+13248
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+13280
    add x16, x16, :lo12:se_static_count_data+13280
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+13312
    add x16, x16, :lo12:se_static_count_data+13312
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+13344
    add x16, x16, :lo12:se_static_count_data+13344
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+13376
    add x16, x16, :lo12:se_static_count_data+13376
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+13408
    add x16, x16, :lo12:se_static_count_data+13408
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+13440
    add x16, x16, :lo12:se_static_count_data+13440
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+13472
    add x16, x16, :lo12:se_static_count_data+13472
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+13504
    add x16, x16, :lo12:se_static_count_data+13504
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+13536
    add x16, x16, :lo12:se_static_count_data+13536
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+13568
    add x16, x16, :lo12:se_static_count_data+13568
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+13600
    add x16, x16, :lo12:se_static_count_data+13600
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+13632
    add x16, x16, :lo12:se_static_count_data+13632
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+13664
    add x16, x16, :lo12:se_static_count_data+13664
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+13696
    add x16, x16, :lo12:se_static_count_data+13696
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+13728
    add x16, x16, :lo12:se_static_count_data+13728
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+13760
    add x16, x16, :lo12:se_static_count_data+13760
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+13792
    add x16, x16, :lo12:se_static_count_data+13792
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+13824
    add x16, x16, :lo12:se_static_count_data+13824
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+13856
    add x16, x16, :lo12:se_static_count_data+13856
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+13888
    add x16, x16, :lo12:se_static_count_data+13888
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+13920
    add x16, x16, :lo12:se_static_count_data+13920
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+13952
    add x16, x16, :lo12:se_static_count_data+13952
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+13984
    add x16, x16, :lo12:se_static_count_data+13984
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+14016
    add x16, x16, :lo12:se_static_count_data+14016
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+14048
    add x16, x16, :lo12:se_static_count_data+14048
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+14080
    add x16, x16, :lo12:se_static_count_data+14080
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+14112
    add x16, x16, :lo12:se_static_count_data+14112
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+14144
    add x16, x16, :lo12:se_static_count_data+14144
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+14176
    add x16, x16, :lo12:se_static_count_data+14176
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+14208
    add x16, x16, :lo12:se_static_count_data+14208
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+14240
    add x16, x16, :lo12:se_static_count_data+14240
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+14272
    add x16, x16, :lo12:se_static_count_data+14272
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+14304
    add x16, x16, :lo12:se_static_count_data+14304
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+14336
    add x16, x16, :lo12:se_static_count_data+14336
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+14368
    add x16, x16, :lo12:se_static_count_data+14368
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+14400
    add x16, x16, :lo12:se_static_count_data+14400
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+14432
    add x16, x16, :lo12:se_static_count_data+14432
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+14464
    add x16, x16, :lo12:se_static_count_data+14464
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+14496
    add x16, x16, :lo12:se_static_count_data+14496
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+14528
    add x16, x16, :lo12:se_static_count_data+14528
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+14560
    add x16, x16, :lo12:se_static_count_data+14560
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+14592
    add x16, x16, :lo12:se_static_count_data+14592
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+14624
    add x16, x16, :lo12:se_static_count_data+14624
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+14656
    add x16, x16, :lo12:se_static_count_data+14656
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+14688
    add x16, x16, :lo12:se_static_count_data+14688
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+14720
    add x16, x16, :lo12:se_static_count_data+14720
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+14752
    add x16, x16, :lo12:se_static_count_data+14752
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+14784
    add x16, x16, :lo12:se_static_count_data+14784
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+14816
    add x16, x16, :lo12:se_static_count_data+14816
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+14848
    add x16, x16, :lo12:se_static_count_data+14848
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+14880
    add x16, x16, :lo12:se_static_count_data+14880
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+14912
    add x16, x16, :lo12:se_static_count_data+14912
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+14944
    add x16, x16, :lo12:se_static_count_data+14944
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+14976
    add x16, x16, :lo12:se_static_count_data+14976
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+15008
    add x16, x16, :lo12:se_static_count_data+15008
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+15040
    add x16, x16, :lo12:se_static_count_data+15040
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+15072
    add x16, x16, :lo12:se_static_count_data+15072
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+15104
    add x16, x16, :lo12:se_static_count_data+15104
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+15136
    add x16, x16, :lo12:se_static_count_data+15136
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+15168
    add x16, x16, :lo12:se_static_count_data+15168
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+15200
    add x16, x16, :lo12:se_static_count_data+15200
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+15232
    add x16, x16, :lo12:se_static_count_data+15232
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+15264
    add x16, x16, :lo12:se_static_count_data+15264
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+15296
    add x16, x16, :lo12:se_static_count_data+15296
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+15328
    add x16, x16, :lo12:se_static_count_data+15328
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+15360
    add x16, x16, :lo12:se_static_count_data+15360
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+15392
    add x16, x16, :lo12:se_static_count_data+15392
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+15424
    add x16, x16, :lo12:se_static_count_data+15424
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+15456
    add x16, x16, :lo12:se_static_count_data+15456
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+15488
    add x16, x16, :lo12:se_static_count_data+15488
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+15520
    add x16, x16, :lo12:se_static_count_data+15520
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+15552
    add x16, x16, :lo12:se_static_count_data+15552
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+15584
    add x16, x16, :lo12:se_static_count_data+15584
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+15616
    add x16, x16, :lo12:se_static_count_data+15616
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+15648
    add x16, x16, :lo12:se_static_count_data+15648
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+15680
    add x16, x16, :lo12:se_static_count_data+15680
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+15712
    add x16, x16, :lo12:se_static_count_data+15712
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+15744
    add x16, x16, :lo12:se_static_count_data+15744
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+15776
    add x16, x16, :lo12:se_static_count_data+15776
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+15808
    add x16, x16, :lo12:se_static_count_data+15808
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+15840
    add x16, x16, :lo12:se_static_count_data+15840
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+15872
    add x16, x16, :lo12:se_static_count_data+15872
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+15904
    add x16, x16, :lo12:se_static_count_data+15904
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+15936
    add x16, x16, :lo12:se_static_count_data+15936
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+15968
    add x16, x16, :lo12:se_static_count_data+15968
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+16000
    add x16, x16, :lo12:se_static_count_data+16000
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+16032
    add x16, x16, :lo12:se_static_count_data+16032
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+16064
    add x16, x16, :lo12:se_static_count_data+16064
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+16096
    add x16, x16, :lo12:se_static_count_data+16096
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+16128
    add x16, x16, :lo12:se_static_count_data+16128
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+16160
    add x16, x16, :lo12:se_static_count_data+16160
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+16192
    add x16, x16, :lo12:se_static_count_data+16192
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+16224
    add x16, x16, :lo12:se_static_count_data+16224
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+16256
    add x16, x16, :lo12:se_static_count_data+16256
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+16288
    add x16, x16, :lo12:se_static_count_data+16288
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+16320
    add x16, x16, :lo12:se_static_count_data+16320
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+16352
    add x16, x16, :lo12:se_static_count_data+16352
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+16384
    add x16, x16, :lo12:se_static_count_data+16384
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+16416
    add x16, x16, :lo12:se_static_count_data+16416
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+16448
    add x16, x16, :lo12:se_static_count_data+16448
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+16480
    add x16, x16, :lo12:se_static_count_data+16480
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+16512
    add x16, x16, :lo12:se_static_count_data+16512
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+16544
    add x16, x16, :lo12:se_static_count_data+16544
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+16576
    add x16, x16, :lo12:se_static_count_data+16576
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+16608
    add x16, x16, :lo12:se_static_count_data+16608
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+16640
    add x16, x16, :lo12:se_static_count_data+16640
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+16672
    add x16, x16, :lo12:se_static_count_data+16672
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+16704
    add x16, x16, :lo12:se_static_count_data+16704
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+16736
    add x16, x16, :lo12:se_static_count_data+16736
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+16768
    add x16, x16, :lo12:se_static_count_data+16768
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+16800
    add x16, x16, :lo12:se_static_count_data+16800
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+16832
    add x16, x16, :lo12:se_static_count_data+16832
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+16864
    add x16, x16, :lo12:se_static_count_data+16864
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+16896
    add x16, x16, :lo12:se_static_count_data+16896
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+16928
    add x16, x16, :lo12:se_static_count_data+16928
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+16960
    add x16, x16, :lo12:se_static_count_data+16960
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+16992
    add x16, x16, :lo12:se_static_count_data+16992
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+17024
    add x16, x16, :lo12:se_static_count_data+17024
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+17056
    add x16, x16, :lo12:se_static_count_data+17056
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+17088
    add x16, x16, :lo12:se_static_count_data+17088
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+17120
    add x16, x16, :lo12:se_static_count_data+17120
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+17152
    add x16, x16, :lo12:se_static_count_data+17152
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+17184
    add x16, x16, :lo12:se_static_count_data+17184
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+17216
    add x16, x16, :lo12:se_static_count_data+17216
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+17248
    add x16, x16, :lo12:se_static_count_data+17248
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+17280
    add x16, x16, :lo12:se_static_count_data+17280
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+17312
    add x16, x16, :lo12:se_static_count_data+17312
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+17344
    add x16, x16, :lo12:se_static_count_data+17344
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+17376
    add x16, x16, :lo12:se_static_count_data+17376
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+17408
    add x16, x16, :lo12:se_static_count_data+17408
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+17440
    add x16, x16, :lo12:se_static_count_data+17440
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+17472
    add x16, x16, :lo12:se_static_count_data+17472
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+17504
    add x16, x16, :lo12:se_static_count_data+17504
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+17536
    add x16, x16, :lo12:se_static_count_data+17536
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+17568
    add x16, x16, :lo12:se_static_count_data+17568
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+17600
    add x16, x16, :lo12:se_static_count_data+17600
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+17632
    add x16, x16, :lo12:se_static_count_data+17632
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+17664
    add x16, x16, :lo12:se_static_count_data+17664
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+17696
    add x16, x16, :lo12:se_static_count_data+17696
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+17728
    add x16, x16, :lo12:se_static_count_data+17728
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+17760
    add x16, x16, :lo12:se_static_count_data+17760
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+17792
    add x16, x16, :lo12:se_static_count_data+17792
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+17824
    add x16, x16, :lo12:se_static_count_data+17824
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+17856
    add x16, x16, :lo12:se_static_count_data+17856
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+17888
    add x16, x16, :lo12:se_static_count_data+17888
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+17920
    add x16, x16, :lo12:se_static_count_data+17920
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+17952
    add x16, x16, :lo12:se_static_count_data+17952
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+17984
    add x16, x16, :lo12:se_static_count_data+17984
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+18016
    add x16, x16, :lo12:se_static_count_data+18016
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+18048
    add x16, x16, :lo12:se_static_count_data+18048
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+18080
    add x16, x16, :lo12:se_static_count_data+18080
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+18112
    add x16, x16, :lo12:se_static_count_data+18112
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+18144
    add x16, x16, :lo12:se_static_count_data+18144
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+18176
    add x16, x16, :lo12:se_static_count_data+18176
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+18208
    add x16, x16, :lo12:se_static_count_data+18208
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+18240
    add x16, x16, :lo12:se_static_count_data+18240
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+18272
    add x16, x16, :lo12:se_static_count_data+18272
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+18304
    add x16, x16, :lo12:se_static_count_data+18304
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+18336
    add x16, x16, :lo12:se_static_count_data+18336
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+18368
    add x16, x16, :lo12:se_static_count_data+18368
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+18400
    add x16, x16, :lo12:se_static_count_data+18400
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+18432
    add x16, x16, :lo12:se_static_count_data+18432
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+18464
    add x16, x16, :lo12:se_static_count_data+18464
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+18496
    add x16, x16, :lo12:se_static_count_data+18496
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+18528
    add x16, x16, :lo12:se_static_count_data+18528
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+18560
    add x16, x16, :lo12:se_static_count_data+18560
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+18592
    add x16, x16, :lo12:se_static_count_data+18592
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+18624
    add x16, x16, :lo12:se_static_count_data+18624
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+18656
    add x16, x16, :lo12:se_static_count_data+18656
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+18688
    add x16, x16, :lo12:se_static_count_data+18688
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+18720
    add x16, x16, :lo12:se_static_count_data+18720
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+18752
    add x16, x16, :lo12:se_static_count_data+18752
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+18784
    add x16, x16, :lo12:se_static_count_data+18784
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+18816
    add x16, x16, :lo12:se_static_count_data+18816
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+18848
    add x16, x16, :lo12:se_static_count_data+18848
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+18880
    add x16, x16, :lo12:se_static_count_data+18880
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+18912
    add x16, x16, :lo12:se_static_count_data+18912
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+18944
    add x16, x16, :lo12:se_static_count_data+18944
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+18976
    add x16, x16, :lo12:se_static_count_data+18976
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+19008
    add x16, x16, :lo12:se_static_count_data+19008
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+19040
    add x16, x16, :lo12:se_static_count_data+19040
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+19072
    add x16, x16, :lo12:se_static_count_data+19072
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+19104
    add x16, x16, :lo12:se_static_count_data+19104
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+19136
    add x16, x16, :lo12:se_static_count_data+19136
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+19168
    add x16, x16, :lo12:se_static_count_data+19168
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+19200
    add x16, x16, :lo12:se_static_count_data+19200
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+19232
    add x16, x16, :lo12:se_static_count_data+19232
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+19264
    add x16, x16, :lo12:se_static_count_data+19264
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+19296
    add x16, x16, :lo12:se_static_count_data+19296
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+19328
    add x16, x16, :lo12:se_static_count_data+19328
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+19360
    add x16, x16, :lo12:se_static_count_data+19360
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+19392
    add x16, x16, :lo12:se_static_count_data+19392
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+19424
    add x16, x16, :lo12:se_static_count_data+19424
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+19456
    add x16, x16, :lo12:se_static_count_data+19456
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+19488
    add x16, x16, :lo12:se_static_count_data+19488
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+19520
    add x16, x16, :lo12:se_static_count_data+19520
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+19552
    add x16, x16, :lo12:se_static_count_data+19552
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+19584
    add x16, x16, :lo12:se_static_count_data+19584
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+19616
    add x16, x16, :lo12:se_static_count_data+19616
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+19648
    add x16, x16, :lo12:se_static_count_data+19648
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+19680
    add x16, x16, :lo12:se_static_count_data+19680
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+19712
    add x16, x16, :lo12:se_static_count_data+19712
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+19744
    add x16, x16, :lo12:se_static_count_data+19744
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+19776
    add x16, x16, :lo12:se_static_count_data+19776
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+19808
    add x16, x16, :lo12:se_static_count_data+19808
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+19840
    add x16, x16, :lo12:se_static_count_data+19840
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+19872
    add x16, x16, :lo12:se_static_count_data+19872
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+19904
    add x16, x16, :lo12:se_static_count_data+19904
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+19936
    add x16, x16, :lo12:se_static_count_data+19936
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+19968
    add x16, x16, :lo12:se_static_count_data+19968
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+20000
    add x16, x16, :lo12:se_static_count_data+20000
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+20032
    add x16, x16, :lo12:se_static_count_data+20032
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+20064
    add x16, x16, :lo12:se_static_count_data+20064
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+20096
    add x16, x16, :lo12:se_static_count_data+20096
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+20128
    add x16, x16, :lo12:se_static_count_data+20128
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+20160
    add x16, x16, :lo12:se_static_count_data+20160
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+20192
    add x16, x16, :lo12:se_static_count_data+20192
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+20224
    add x16, x16, :lo12:se_static_count_data+20224
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+20256
    add x16, x16, :lo12:se_static_count_data+20256
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+20288
    add x16, x16, :lo12:se_static_count_data+20288
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+20320
    add x16, x16, :lo12:se_static_count_data+20320
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+20352
    add x16, x16, :lo12:se_static_count_data+20352
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+20384
    add x16, x16, :lo12:se_static_count_data+20384
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+20416
    add x16, x16, :lo12:se_static_count_data+20416
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+20448
    add x16, x16, :lo12:se_static_count_data+20448
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+20480
    add x16, x16, :lo12:se_static_count_data+20480
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+20512
    add x16, x16, :lo12:se_static_count_data+20512
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+20544
    add x16, x16, :lo12:se_static_count_data+20544
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+20576
    add x16, x16, :lo12:se_static_count_data+20576
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+20608
    add x16, x16, :lo12:se_static_count_data+20608
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+20640
    add x16, x16, :lo12:se_static_count_data+20640
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+20672
    add x16, x16, :lo12:se_static_count_data+20672
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+20704
    add x16, x16, :lo12:se_static_count_data+20704
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+20736
    add x16, x16, :lo12:se_static_count_data+20736
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+20768
    add x16, x16, :lo12:se_static_count_data+20768
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+20800
    add x16, x16, :lo12:se_static_count_data+20800
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+20832
    add x16, x16, :lo12:se_static_count_data+20832
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+20864
    add x16, x16, :lo12:se_static_count_data+20864
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+20896
    add x16, x16, :lo12:se_static_count_data+20896
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+20928
    add x16, x16, :lo12:se_static_count_data+20928
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+20960
    add x16, x16, :lo12:se_static_count_data+20960
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+20992
    add x16, x16, :lo12:se_static_count_data+20992
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+21024
    add x16, x16, :lo12:se_static_count_data+21024
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+21056
    add x16, x16, :lo12:se_static_count_data+21056
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+21088
    add x16, x16, :lo12:se_static_count_data+21088
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+21120
    add x16, x16, :lo12:se_static_count_data+21120
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+21152
    add x16, x16, :lo12:se_static_count_data+21152
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+21184
    add x16, x16, :lo12:se_static_count_data+21184
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+21216
    add x16, x16, :lo12:se_static_count_data+21216
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+21248
    add x16, x16, :lo12:se_static_count_data+21248
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+21280
    add x16, x16, :lo12:se_static_count_data+21280
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+21312
    add x16, x16, :lo12:se_static_count_data+21312
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+21344
    add x16, x16, :lo12:se_static_count_data+21344
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+21376
    add x16, x16, :lo12:se_static_count_data+21376
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+21408
    add x16, x16, :lo12:se_static_count_data+21408
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+21440
    add x16, x16, :lo12:se_static_count_data+21440
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+21472
    add x16, x16, :lo12:se_static_count_data+21472
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+21504
    add x16, x16, :lo12:se_static_count_data+21504
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+21536
    add x16, x16, :lo12:se_static_count_data+21536
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+21568
    add x16, x16, :lo12:se_static_count_data+21568
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+21600
    add x16, x16, :lo12:se_static_count_data+21600
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+21632
    add x16, x16, :lo12:se_static_count_data+21632
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+21664
    add x16, x16, :lo12:se_static_count_data+21664
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+21696
    add x16, x16, :lo12:se_static_count_data+21696
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+21728
    add x16, x16, :lo12:se_static_count_data+21728
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+21760
    add x16, x16, :lo12:se_static_count_data+21760
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+21792
    add x16, x16, :lo12:se_static_count_data+21792
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+21824
    add x16, x16, :lo12:se_static_count_data+21824
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+21856
    add x16, x16, :lo12:se_static_count_data+21856
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+21888
    add x16, x16, :lo12:se_static_count_data+21888
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+21920
    add x16, x16, :lo12:se_static_count_data+21920
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+21952
    add x16, x16, :lo12:se_static_count_data+21952
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+21984
    add x16, x16, :lo12:se_static_count_data+21984
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+22016
    add x16, x16, :lo12:se_static_count_data+22016
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+22048
    add x16, x16, :lo12:se_static_count_data+22048
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+22080
    add x16, x16, :lo12:se_static_count_data+22080
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+22112
    add x16, x16, :lo12:se_static_count_data+22112
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+22144
    add x16, x16, :lo12:se_static_count_data+22144
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+22176
    add x16, x16, :lo12:se_static_count_data+22176
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+22208
    add x16, x16, :lo12:se_static_count_data+22208
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+22240
    add x16, x16, :lo12:se_static_count_data+22240
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+22272
    add x16, x16, :lo12:se_static_count_data+22272
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+22304
    add x16, x16, :lo12:se_static_count_data+22304
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+22336
    add x16, x16, :lo12:se_static_count_data+22336
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+22368
    add x16, x16, :lo12:se_static_count_data+22368
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+22400
    add x16, x16, :lo12:se_static_count_data+22400
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+22432
    add x16, x16, :lo12:se_static_count_data+22432
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+22464
    add x16, x16, :lo12:se_static_count_data+22464
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+22496
    add x16, x16, :lo12:se_static_count_data+22496
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+22528
    add x16, x16, :lo12:se_static_count_data+22528
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+22560
    add x16, x16, :lo12:se_static_count_data+22560
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+22592
    add x16, x16, :lo12:se_static_count_data+22592
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+22624
    add x16, x16, :lo12:se_static_count_data+22624
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+22656
    add x16, x16, :lo12:se_static_count_data+22656
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+22688
    add x16, x16, :lo12:se_static_count_data+22688
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+22720
    add x16, x16, :lo12:se_static_count_data+22720
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+22752
    add x16, x16, :lo12:se_static_count_data+22752
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+22784
    add x16, x16, :lo12:se_static_count_data+22784
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+22816
    add x16, x16, :lo12:se_static_count_data+22816
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+22848
    add x16, x16, :lo12:se_static_count_data+22848
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+22880
    add x16, x16, :lo12:se_static_count_data+22880
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+22912
    add x16, x16, :lo12:se_static_count_data+22912
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+22944
    add x16, x16, :lo12:se_static_count_data+22944
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+22976
    add x16, x16, :lo12:se_static_count_data+22976
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+23008
    add x16, x16, :lo12:se_static_count_data+23008
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+23040
    add x16, x16, :lo12:se_static_count_data+23040
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+23072
    add x16, x16, :lo12:se_static_count_data+23072
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+23104
    add x16, x16, :lo12:se_static_count_data+23104
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+23136
    add x16, x16, :lo12:se_static_count_data+23136
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+23168
    add x16, x16, :lo12:se_static_count_data+23168
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+23200
    add x16, x16, :lo12:se_static_count_data+23200
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+23232
    add x16, x16, :lo12:se_static_count_data+23232
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+23264
    add x16, x16, :lo12:se_static_count_data+23264
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+23296
    add x16, x16, :lo12:se_static_count_data+23296
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+23328
    add x16, x16, :lo12:se_static_count_data+23328
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+23360
    add x16, x16, :lo12:se_static_count_data+23360
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+23392
    add x16, x16, :lo12:se_static_count_data+23392
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+23424
    add x16, x16, :lo12:se_static_count_data+23424
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+23456
    add x16, x16, :lo12:se_static_count_data+23456
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+23488
    add x16, x16, :lo12:se_static_count_data+23488
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+23520
    add x16, x16, :lo12:se_static_count_data+23520
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+23552
    add x16, x16, :lo12:se_static_count_data+23552
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+23584
    add x16, x16, :lo12:se_static_count_data+23584
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+23616
    add x16, x16, :lo12:se_static_count_data+23616
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+23648
    add x16, x16, :lo12:se_static_count_data+23648
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+23680
    add x16, x16, :lo12:se_static_count_data+23680
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+23712
    add x16, x16, :lo12:se_static_count_data+23712
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+23744
    add x16, x16, :lo12:se_static_count_data+23744
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+23776
    add x16, x16, :lo12:se_static_count_data+23776
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+23808
    add x16, x16, :lo12:se_static_count_data+23808
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+23840
    add x16, x16, :lo12:se_static_count_data+23840
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+23872
    add x16, x16, :lo12:se_static_count_data+23872
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+23904
    add x16, x16, :lo12:se_static_count_data+23904
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+23936
    add x16, x16, :lo12:se_static_count_data+23936
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+23968
    add x16, x16, :lo12:se_static_count_data+23968
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+24000
    add x16, x16, :lo12:se_static_count_data+24000
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+24032
    add x16, x16, :lo12:se_static_count_data+24032
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+24064
    add x16, x16, :lo12:se_static_count_data+24064
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+24096
    add x16, x16, :lo12:se_static_count_data+24096
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+24128
    add x16, x16, :lo12:se_static_count_data+24128
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+24160
    add x16, x16, :lo12:se_static_count_data+24160
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+24192
    add x16, x16, :lo12:se_static_count_data+24192
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+24224
    add x16, x16, :lo12:se_static_count_data+24224
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+24256
    add x16, x16, :lo12:se_static_count_data+24256
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+24288
    add x16, x16, :lo12:se_static_count_data+24288
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+24320
    add x16, x16, :lo12:se_static_count_data+24320
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+24352
    add x16, x16, :lo12:se_static_count_data+24352
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+24384
    add x16, x16, :lo12:se_static_count_data+24384
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+24416
    add x16, x16, :lo12:se_static_count_data+24416
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+24448
    add x16, x16, :lo12:se_static_count_data+24448
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+24480
    add x16, x16, :lo12:se_static_count_data+24480
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+24512
    add x16, x16, :lo12:se_static_count_data+24512
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+24544
    add x16, x16, :lo12:se_static_count_data+24544
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+24576
    add x16, x16, :lo12:se_static_count_data+24576
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+24608
    add x16, x16, :lo12:se_static_count_data+24608
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+24640
    add x16, x16, :lo12:se_static_count_data+24640
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+24672
    add x16, x16, :lo12:se_static_count_data+24672
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+24704
    add x16, x16, :lo12:se_static_count_data+24704
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+24736
    add x16, x16, :lo12:se_static_count_data+24736
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+24768
    add x16, x16, :lo12:se_static_count_data+24768
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+24800
    add x16, x16, :lo12:se_static_count_data+24800
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+24832
    add x16, x16, :lo12:se_static_count_data+24832
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+24864
    add x16, x16, :lo12:se_static_count_data+24864
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+24896
    add x16, x16, :lo12:se_static_count_data+24896
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+24928
    add x16, x16, :lo12:se_static_count_data+24928
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+24960
    add x16, x16, :lo12:se_static_count_data+24960
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+24992
    add x16, x16, :lo12:se_static_count_data+24992
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+25024
    add x16, x16, :lo12:se_static_count_data+25024
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+25056
    add x16, x16, :lo12:se_static_count_data+25056
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+25088
    add x16, x16, :lo12:se_static_count_data+25088
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+25120
    add x16, x16, :lo12:se_static_count_data+25120
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+25152
    add x16, x16, :lo12:se_static_count_data+25152
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+25184
    add x16, x16, :lo12:se_static_count_data+25184
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+25216
    add x16, x16, :lo12:se_static_count_data+25216
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+25248
    add x16, x16, :lo12:se_static_count_data+25248
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+25280
    add x16, x16, :lo12:se_static_count_data+25280
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+25312
    add x16, x16, :lo12:se_static_count_data+25312
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+25344
    add x16, x16, :lo12:se_static_count_data+25344
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+25376
    add x16, x16, :lo12:se_static_count_data+25376
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+25408
    add x16, x16, :lo12:se_static_count_data+25408
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+25440
    add x16, x16, :lo12:se_static_count_data+25440
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+25472
    add x16, x16, :lo12:se_static_count_data+25472
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+25504
    add x16, x16, :lo12:se_static_count_data+25504
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+25536
    add x16, x16, :lo12:se_static_count_data+25536
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+25568
    add x16, x16, :lo12:se_static_count_data+25568
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+25600
    add x16, x16, :lo12:se_static_count_data+25600
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+25632
    add x16, x16, :lo12:se_static_count_data+25632
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+25664
    add x16, x16, :lo12:se_static_count_data+25664
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+25696
    add x16, x16, :lo12:se_static_count_data+25696
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+25728
    add x16, x16, :lo12:se_static_count_data+25728
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+25760
    add x16, x16, :lo12:se_static_count_data+25760
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+25792
    add x16, x16, :lo12:se_static_count_data+25792
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+25824
    add x16, x16, :lo12:se_static_count_data+25824
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+25856
    add x16, x16, :lo12:se_static_count_data+25856
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+25888
    add x16, x16, :lo12:se_static_count_data+25888
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+25920
    add x16, x16, :lo12:se_static_count_data+25920
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+25952
    add x16, x16, :lo12:se_static_count_data+25952
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+25984
    add x16, x16, :lo12:se_static_count_data+25984
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+26016
    add x16, x16, :lo12:se_static_count_data+26016
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+26048
    add x16, x16, :lo12:se_static_count_data+26048
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+26080
    add x16, x16, :lo12:se_static_count_data+26080
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+26112
    add x16, x16, :lo12:se_static_count_data+26112
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+26144
    add x16, x16, :lo12:se_static_count_data+26144
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+26176
    add x16, x16, :lo12:se_static_count_data+26176
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+26208
    add x16, x16, :lo12:se_static_count_data+26208
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+26240
    add x16, x16, :lo12:se_static_count_data+26240
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+26272
    add x16, x16, :lo12:se_static_count_data+26272
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+26304
    add x16, x16, :lo12:se_static_count_data+26304
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+26336
    add x16, x16, :lo12:se_static_count_data+26336
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+26368
    add x16, x16, :lo12:se_static_count_data+26368
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+26400
    add x16, x16, :lo12:se_static_count_data+26400
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+26432
    add x16, x16, :lo12:se_static_count_data+26432
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+26464
    add x16, x16, :lo12:se_static_count_data+26464
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+26496
    add x16, x16, :lo12:se_static_count_data+26496
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+26528
    add x16, x16, :lo12:se_static_count_data+26528
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+26560
    add x16, x16, :lo12:se_static_count_data+26560
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+26592
    add x16, x16, :lo12:se_static_count_data+26592
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+26624
    add x16, x16, :lo12:se_static_count_data+26624
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+26656
    add x16, x16, :lo12:se_static_count_data+26656
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+26688
    add x16, x16, :lo12:se_static_count_data+26688
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+26720
    add x16, x16, :lo12:se_static_count_data+26720
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+26752
    add x16, x16, :lo12:se_static_count_data+26752
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+26784
    add x16, x16, :lo12:se_static_count_data+26784
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+26816
    add x16, x16, :lo12:se_static_count_data+26816
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+26848
    add x16, x16, :lo12:se_static_count_data+26848
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+26880
    add x16, x16, :lo12:se_static_count_data+26880
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+26912
    add x16, x16, :lo12:se_static_count_data+26912
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+26944
    add x16, x16, :lo12:se_static_count_data+26944
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+26976
    add x16, x16, :lo12:se_static_count_data+26976
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+27008
    add x16, x16, :lo12:se_static_count_data+27008
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+27040
    add x16, x16, :lo12:se_static_count_data+27040
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+27072
    add x16, x16, :lo12:se_static_count_data+27072
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+27104
    add x16, x16, :lo12:se_static_count_data+27104
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+27136
    add x16, x16, :lo12:se_static_count_data+27136
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+27168
    add x16, x16, :lo12:se_static_count_data+27168
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+27200
    add x16, x16, :lo12:se_static_count_data+27200
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+27232
    add x16, x16, :lo12:se_static_count_data+27232
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+27264
    add x16, x16, :lo12:se_static_count_data+27264
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+27296
    add x16, x16, :lo12:se_static_count_data+27296
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+27328
    add x16, x16, :lo12:se_static_count_data+27328
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+27360
    add x16, x16, :lo12:se_static_count_data+27360
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+27392
    add x16, x16, :lo12:se_static_count_data+27392
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+27424
    add x16, x16, :lo12:se_static_count_data+27424
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+27456
    add x16, x16, :lo12:se_static_count_data+27456
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+27488
    add x16, x16, :lo12:se_static_count_data+27488
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+27520
    add x16, x16, :lo12:se_static_count_data+27520
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+27552
    add x16, x16, :lo12:se_static_count_data+27552
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+27584
    add x16, x16, :lo12:se_static_count_data+27584
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+27616
    add x16, x16, :lo12:se_static_count_data+27616
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+27648
    add x16, x16, :lo12:se_static_count_data+27648
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+27680
    add x16, x16, :lo12:se_static_count_data+27680
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+27712
    add x16, x16, :lo12:se_static_count_data+27712
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+27744
    add x16, x16, :lo12:se_static_count_data+27744
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+27776
    add x16, x16, :lo12:se_static_count_data+27776
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+27808
    add x16, x16, :lo12:se_static_count_data+27808
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+27840
    add x16, x16, :lo12:se_static_count_data+27840
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+27872
    add x16, x16, :lo12:se_static_count_data+27872
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+27904
    add x16, x16, :lo12:se_static_count_data+27904
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+27936
    add x16, x16, :lo12:se_static_count_data+27936
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+27968
    add x16, x16, :lo12:se_static_count_data+27968
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+28000
    add x16, x16, :lo12:se_static_count_data+28000
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+28032
    add x16, x16, :lo12:se_static_count_data+28032
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+28064
    add x16, x16, :lo12:se_static_count_data+28064
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+28096
    add x16, x16, :lo12:se_static_count_data+28096
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+28128
    add x16, x16, :lo12:se_static_count_data+28128
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+28160
    add x16, x16, :lo12:se_static_count_data+28160
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+28192
    add x16, x16, :lo12:se_static_count_data+28192
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+28224
    add x16, x16, :lo12:se_static_count_data+28224
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+28256
    add x16, x16, :lo12:se_static_count_data+28256
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+28288
    add x16, x16, :lo12:se_static_count_data+28288
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+28320
    add x16, x16, :lo12:se_static_count_data+28320
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+28352
    add x16, x16, :lo12:se_static_count_data+28352
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+28384
    add x16, x16, :lo12:se_static_count_data+28384
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+28416
    add x16, x16, :lo12:se_static_count_data+28416
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+28448
    add x16, x16, :lo12:se_static_count_data+28448
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+28480
    add x16, x16, :lo12:se_static_count_data+28480
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+28512
    add x16, x16, :lo12:se_static_count_data+28512
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+28544
    add x16, x16, :lo12:se_static_count_data+28544
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+28576
    add x16, x16, :lo12:se_static_count_data+28576
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+28608
    add x16, x16, :lo12:se_static_count_data+28608
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+28640
    add x16, x16, :lo12:se_static_count_data+28640
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+28672
    add x16, x16, :lo12:se_static_count_data+28672
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+28704
    add x16, x16, :lo12:se_static_count_data+28704
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+28736
    add x16, x16, :lo12:se_static_count_data+28736
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+28768
    add x16, x16, :lo12:se_static_count_data+28768
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+28800
    add x16, x16, :lo12:se_static_count_data+28800
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+28832
    add x16, x16, :lo12:se_static_count_data+28832
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+28864
    add x16, x16, :lo12:se_static_count_data+28864
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+28896
    add x16, x16, :lo12:se_static_count_data+28896
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+28928
    add x16, x16, :lo12:se_static_count_data+28928
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+28960
    add x16, x16, :lo12:se_static_count_data+28960
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+28992
    add x16, x16, :lo12:se_static_count_data+28992
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+29024
    add x16, x16, :lo12:se_static_count_data+29024
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+29056
    add x16, x16, :lo12:se_static_count_data+29056
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+29088
    add x16, x16, :lo12:se_static_count_data+29088
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+29120
    add x16, x16, :lo12:se_static_count_data+29120
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+29152
    add x16, x16, :lo12:se_static_count_data+29152
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+29184
    add x16, x16, :lo12:se_static_count_data+29184
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+29216
    add x16, x16, :lo12:se_static_count_data+29216
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+29248
    add x16, x16, :lo12:se_static_count_data+29248
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+29280
    add x16, x16, :lo12:se_static_count_data+29280
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+29312
    add x16, x16, :lo12:se_static_count_data+29312
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+29344
    add x16, x16, :lo12:se_static_count_data+29344
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+29376
    add x16, x16, :lo12:se_static_count_data+29376
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+29408
    add x16, x16, :lo12:se_static_count_data+29408
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+29440
    add x16, x16, :lo12:se_static_count_data+29440
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+29472
    add x16, x16, :lo12:se_static_count_data+29472
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+29504
    add x16, x16, :lo12:se_static_count_data+29504
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+29536
    add x16, x16, :lo12:se_static_count_data+29536
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+29568
    add x16, x16, :lo12:se_static_count_data+29568
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+29600
    add x16, x16, :lo12:se_static_count_data+29600
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+29632
    add x16, x16, :lo12:se_static_count_data+29632
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+29664
    add x16, x16, :lo12:se_static_count_data+29664
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+29696
    add x16, x16, :lo12:se_static_count_data+29696
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+29728
    add x16, x16, :lo12:se_static_count_data+29728
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+29760
    add x16, x16, :lo12:se_static_count_data+29760
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+29792
    add x16, x16, :lo12:se_static_count_data+29792
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+29824
    add x16, x16, :lo12:se_static_count_data+29824
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+29856
    add x16, x16, :lo12:se_static_count_data+29856
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+29888
    add x16, x16, :lo12:se_static_count_data+29888
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+29920
    add x16, x16, :lo12:se_static_count_data+29920
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+29952
    add x16, x16, :lo12:se_static_count_data+29952
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+29984
    add x16, x16, :lo12:se_static_count_data+29984
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+30016
    add x16, x16, :lo12:se_static_count_data+30016
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+30048
    add x16, x16, :lo12:se_static_count_data+30048
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+30080
    add x16, x16, :lo12:se_static_count_data+30080
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+30112
    add x16, x16, :lo12:se_static_count_data+30112
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+30144
    add x16, x16, :lo12:se_static_count_data+30144
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+30176
    add x16, x16, :lo12:se_static_count_data+30176
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+30208
    add x16, x16, :lo12:se_static_count_data+30208
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+30240
    add x16, x16, :lo12:se_static_count_data+30240
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+30272
    add x16, x16, :lo12:se_static_count_data+30272
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+30304
    add x16, x16, :lo12:se_static_count_data+30304
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+30336
    add x16, x16, :lo12:se_static_count_data+30336
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+30368
    add x16, x16, :lo12:se_static_count_data+30368
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+30400
    add x16, x16, :lo12:se_static_count_data+30400
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+30432
    add x16, x16, :lo12:se_static_count_data+30432
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+30464
    add x16, x16, :lo12:se_static_count_data+30464
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+30496
    add x16, x16, :lo12:se_static_count_data+30496
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+30528
    add x16, x16, :lo12:se_static_count_data+30528
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+30560
    add x16, x16, :lo12:se_static_count_data+30560
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+30592
    add x16, x16, :lo12:se_static_count_data+30592
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+30624
    add x16, x16, :lo12:se_static_count_data+30624
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+30656
    add x16, x16, :lo12:se_static_count_data+30656
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+30688
    add x16, x16, :lo12:se_static_count_data+30688
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+30720
    add x16, x16, :lo12:se_static_count_data+30720
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+30752
    add x16, x16, :lo12:se_static_count_data+30752
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+30784
    add x16, x16, :lo12:se_static_count_data+30784
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+30816
    add x16, x16, :lo12:se_static_count_data+30816
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+30848
    add x16, x16, :lo12:se_static_count_data+30848
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+30880
    add x16, x16, :lo12:se_static_count_data+30880
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+30912
    add x16, x16, :lo12:se_static_count_data+30912
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+30944
    add x16, x16, :lo12:se_static_count_data+30944
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+30976
    add x16, x16, :lo12:se_static_count_data+30976
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+31008
    add x16, x16, :lo12:se_static_count_data+31008
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+31040
    add x16, x16, :lo12:se_static_count_data+31040
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+31072
    add x16, x16, :lo12:se_static_count_data+31072
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+31104
    add x16, x16, :lo12:se_static_count_data+31104
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+31136
    add x16, x16, :lo12:se_static_count_data+31136
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+31168
    add x16, x16, :lo12:se_static_count_data+31168
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+31200
    add x16, x16, :lo12:se_static_count_data+31200
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+31232
    add x16, x16, :lo12:se_static_count_data+31232
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+31264
    add x16, x16, :lo12:se_static_count_data+31264
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+31296
    add x16, x16, :lo12:se_static_count_data+31296
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+31328
    add x16, x16, :lo12:se_static_count_data+31328
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+31360
    add x16, x16, :lo12:se_static_count_data+31360
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+31392
    add x16, x16, :lo12:se_static_count_data+31392
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+31424
    add x16, x16, :lo12:se_static_count_data+31424
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+31456
    add x16, x16, :lo12:se_static_count_data+31456
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+31488
    add x16, x16, :lo12:se_static_count_data+31488
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+31520
    add x16, x16, :lo12:se_static_count_data+31520
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+31552
    add x16, x16, :lo12:se_static_count_data+31552
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+31584
    add x16, x16, :lo12:se_static_count_data+31584
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+31616
    add x16, x16, :lo12:se_static_count_data+31616
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+31648
    add x16, x16, :lo12:se_static_count_data+31648
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+31680
    add x16, x16, :lo12:se_static_count_data+31680
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+31712
    add x16, x16, :lo12:se_static_count_data+31712
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+31744
    add x16, x16, :lo12:se_static_count_data+31744
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+31776
    add x16, x16, :lo12:se_static_count_data+31776
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+31808
    add x16, x16, :lo12:se_static_count_data+31808
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+31840
    add x16, x16, :lo12:se_static_count_data+31840
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+31872
    add x16, x16, :lo12:se_static_count_data+31872
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+31904
    add x16, x16, :lo12:se_static_count_data+31904
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+31936
    add x16, x16, :lo12:se_static_count_data+31936
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+31968
    add x16, x16, :lo12:se_static_count_data+31968
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+32000
    add x16, x16, :lo12:se_static_count_data+32000
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+32032
    add x16, x16, :lo12:se_static_count_data+32032
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+32064
    add x16, x16, :lo12:se_static_count_data+32064
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+32096
    add x16, x16, :lo12:se_static_count_data+32096
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+32128
    add x16, x16, :lo12:se_static_count_data+32128
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+32160
    add x16, x16, :lo12:se_static_count_data+32160
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+32192
    add x16, x16, :lo12:se_static_count_data+32192
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+32224
    add x16, x16, :lo12:se_static_count_data+32224
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+32256
    add x16, x16, :lo12:se_static_count_data+32256
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+32288
    add x16, x16, :lo12:se_static_count_data+32288
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+32320
    add x16, x16, :lo12:se_static_count_data+32320
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+32352
    add x16, x16, :lo12:se_static_count_data+32352
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+32384
    add x16, x16, :lo12:se_static_count_data+32384
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+32416
    add x16, x16, :lo12:se_static_count_data+32416
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+32448
    add x16, x16, :lo12:se_static_count_data+32448
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+32480
    add x16, x16, :lo12:se_static_count_data+32480
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+32512
    add x16, x16, :lo12:se_static_count_data+32512
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+32544
    add x16, x16, :lo12:se_static_count_data+32544
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+32576
    add x16, x16, :lo12:se_static_count_data+32576
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+32608
    add x16, x16, :lo12:se_static_count_data+32608
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+32640
    add x16, x16, :lo12:se_static_count_data+32640
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+32672
    add x16, x16, :lo12:se_static_count_data+32672
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+32704
    add x16, x16, :lo12:se_static_count_data+32704
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    adrp x16, se_static_count_data+32736
    add x16, x16, :lo12:se_static_count_data+32736
    ldr x17, [x16, #24]
    cmp x0, x17
    b.ne 1f
    ldr x17, [x16]
    add x17, x17, #1
    str x17, [x16]
    mrs x17, tpidr_el0
    str x17, [x16, #8]
1:  ldr x16, [x16, #16]
    br x16
    .p2align 6
    .globl se_static_count_stubs_end
    .hidden se_static_count_stubs_end
se_static_count_stubs_end:

    .p2align 4
    .globl se_static_pre_stub
    .hidden se_static_pre_stub
se_static_pre_stub:
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
    adrp x16, se_static_pre_data
    add x16, x16, :lo12:se_static_pre_data
    ldr x1, [x16, #8]
    ldr x16, [x16]
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
    adrp x16, se_static_pre_data
    add x16, x16, :lo12:se_static_pre_data
    ldr x16, [x16, #16]
    br x16

    .section .note.GNU-stack,"",%progbits
#endif

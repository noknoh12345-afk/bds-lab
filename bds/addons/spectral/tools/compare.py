import sys, numpy as np, subprocess
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
sys.path.insert(0, 'tools'); import spectral as S
a = S.load_audio(sys.argv[1], 44100); b = S.load_audio(sys.argv[2], 44100)
t0, t1 = float(sys.argv[4]), float(sys.argv[5])
fig, ax = plt.subplots(2, 1, figsize=(13, 8), sharex=True)
for i, (x, name) in enumerate(((a, 'original'), (b, 'in-game synthesis (emulated)'))):
    seg = x[int(t0*44100):int(t1*44100)]
    ax[i].specgram(seg, NFFT=4096, Fs=44100, noverlap=3584, cmap='magma', vmin=-110, vmax=-20, scale='dB')
    ax[i].set_yscale('symlog', linthresh=200); ax[i].set_ylim(30, 16000); ax[i].set_title(name); ax[i].set_ylabel('Hz')
plt.tight_layout(); plt.savefig(sys.argv[3], dpi=70)

import sys, numpy as np; sys.path.insert(0, sys.argv[1]+'/tools/metrics'); import metrics as M
D=sys.argv[2]; SR=48000
def band(x,lo,hi):
  W=SR//5; out=[]
  for i in range(0,len(x)-W,W):
    X=np.abs(np.fft.rfft(x[i:i+W]*np.hanning(W)))**2; f=np.fft.rfftfreq(W,1/SR)
    out.append(10*np.log10(X[(f>=lo)&(f<hi)].sum()+1e-12))
  return out
for sent in ['hello','piano']:
  for arm in ['none','0','6','12']:
    x=M.load(f'{D}/dk{arm}_{sent}.opus')
    print(sent,arm.ljust(4),' '.join('%4d'%v for v in band(x,30,150)[:60]))

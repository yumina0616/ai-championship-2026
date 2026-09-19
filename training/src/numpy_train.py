"""기존 NumPy CPU 학습. TFJS 초기 가중치를 받아 checkpoint만 반환한다."""
import json, sys
import numpy as np
payload=json.loads(sys.stdin.readline())
c=payload['config']; data=payload['samples']
x=np.asarray([s['features'] for s in data],dtype=np.float32)
y=np.asarray([s['label'] for s in data],dtype=np.float32)
w=[np.asarray(a['values'],dtype=np.float32).reshape(a['shape']) for a in payload['weights']]
m=[np.zeros_like(a) for a in w]; v=[np.zeros_like(a) for a in w]
step=0; batch=c.get('batch',32); gear=c.get('gear',False); linear=c.get('linear',False) or gear
if gear:
    target=np.zeros((len(y),4),dtype=np.float32)
    idx=np.where(y[:,0]<-.01,0,np.where(y[:,0]>.01,2,1))
    target[np.arange(len(y)),idx]=1; target[:,3]=y[:,1]; y=target
for epoch in range(c['epochs']):
    rng=np.random.default_rng(c['seed']+(epoch if c['shuffle'] else 0))
    order=rng.permutation(len(x)); lr=c['lr']*(.1**int(epoch/(c['epochs']/3)) if c['decay'] else 1)
    total=0
    for start in range(0,len(x),batch):
        ids=order[start:start+batch]; a=x[ids]; activations=[a]; zs=[]
        for i in range(0,len(w),2):
            z=a@w[i]+w[i+1]; zs.append(z)
            a=np.maximum(z,0) if i<len(w)-2 else z if linear else np.tanh(z)
            activations.append(a)
        if gear:
            logits=a[:,:3]-a[:,:3].max(axis=1,keepdims=True)
            prob=np.exp(logits); prob/=prob.sum(axis=1,keepdims=True)
            loss=-(y[ids,:3]*np.log(np.maximum(prob,1e-12))).sum(axis=1).mean()+((a[:,3]-y[ids,3])**2).mean()
            delta=np.empty_like(a); delta[:,:3]=(prob-y[ids,:3])/len(ids); delta[:,3]=2*(a[:,3]-y[ids,3])/len(ids)
        else:
            loss=((a-y[ids])**2).mean(); delta=2*(a-y[ids])/a.size
            if not linear: delta*=1-a*a
        total+=float(loss)*len(ids); grads=[None]*len(w)
        for layer in range(len(zs)-1,-1,-1):
            i=layer*2; grads[i]=activations[layer].T@delta;grads[i+1]=delta.sum(axis=0)
            if layer:delta=(delta@w[i].T)*(zs[layer-1]>0)
        step+=1
        for i,g in enumerate(grads):
            m[i]=.9*m[i]+.1*g;v[i]=.999*v[i]+.001*g*g
            w[i]-=lr*(m[i]/(1-.9**step))/(np.sqrt(v[i]/(1-.999**step))+1e-7)
    if (epoch+1)%c.get('evalEvery',100)==0 or epoch==c['epochs']-1:
        print(json.dumps({'epoch':epoch+1,'lr':lr,'loss':total/len(x),'weights':[a.flatten().tolist() for a in w]}),flush=True)
        if sys.stdin.readline().strip()!='continue':break

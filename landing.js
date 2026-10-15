const cards=[...document.querySelectorAll('.lab-card')];
const filters=[...document.querySelectorAll('[data-filter]')];
let category='全部';
function filterLabs(){const query=document.querySelector('#lab-search').value.trim().toLocaleLowerCase();let count=0;for(const card of cards){const visible=(category==='全部'||card.dataset.category===category)&&card.dataset.search.toLocaleLowerCase().includes(query);card.hidden=!visible;if(visible)count++;}document.querySelector('#lab-count').textContent=`${count} 个实验室`;document.querySelector('#empty-state').hidden=count>0;}
for(const button of filters)button.addEventListener('click',()=>{category=button.dataset.filter;for(const item of filters){const active=item===button;item.classList.toggle('selected',active);item.setAttribute('aria-pressed',String(active));}filterLabs();});
document.querySelector('#lab-search').addEventListener('input',filterLabs);

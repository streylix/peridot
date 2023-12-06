document.getElementById('login-submit').addEventListener('submit', function(event){
    event.preventDefault();
    const userArray = JSON.parse(localStorage.getItem('users')) || [];

    const email = document.getElementById('email').value;
    const pass = document.getElementById('pass').value;


    const userExists = userArray.some(user => user.email === email && user.pass === btoa(pass));
    if (userExists){
        alert('Login successful!');
        setTimeout(function(){
            window.location.href = "../app/index.html";
        }, 100);
    } else {
        alert('Invalid login attempt');
    }
});
document.getElementById('signupForm').addEventListener('submit', function(event){
    event.preventDefault();

    const email = document.getElementById('email').value;
    const pass = document.getElementById('pass').value;
    const passConfirm = document.getElementById('passConfirm').value;

    if (pass === passConfirm){
        const newUser = { email: email, pass: btoa(pass)};

        let users = JSON.parse(localStorage.getItem('users')) || [];

        const userExists = users.some(user => user.email === email);
        if (userExists){
            alert("Account under provided email already exists!");
            document.getElementById('email').value = '';
            document.getElementById('pass').value = '';
            document.getElementById('passConfirm').value = '';
            return;
        }

        users.push(newUser);
        localStorage.setItem('users', JSON.stringify(users));

        document.getElementById('signupForm').reset();

        alert('Signup successful!');
        setTimeout(function(){
            window.location.href = "../app/index.html";
        }, 100)
    } else {
        alert('Passwords do not match.');
    }
});